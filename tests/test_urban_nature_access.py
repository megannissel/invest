# coding=UTF-8
"""Tests for the Urban Nature Access Model."""
import math
import os
import random
import shutil
import tempfile
import textwrap
import unittest

import numpy
import pandas
import pandas.testing
import pygeoprocessing
import shapely.geometry
from osgeo import gdal
from osgeo import ogr
from osgeo import osr

_DEFAULT_ORIGIN = (444720, 3751320)
_DEFAULT_PIXEL_SIZE = (30, -30)
_DEFAULT_EPSG = 3116


def _build_model_args(workspace):
    args = {
        'workspace_dir': os.path.join(workspace, 'workspace'),
        'results_suffix': 'suffix',
        'population_raster_path': os.path.join(
            workspace, 'population.tif'),
        'lulc_raster_path': os.path.join(workspace, 'lulc.tif'),
        'lulc_attribute_table': os.path.join(
            workspace, 'lulc_attributes.csv'),
        'decay_function': 'gaussian',
        'greenspace_demand': 100,  # square meters
        'admin_unit_vector_path': os.path.join(
            workspace, 'admin_units.geojson'),
    }

    random.seed(-1)  # for our random number generation
    population_pixel_size = (90, -90)
    population_array_shape = (10, 10)
    population_array = numpy.array(
        random.choices(range(0, 100), k=100),
        dtype=numpy.int32).reshape(population_array_shape)
    population_srs = osr.SpatialReference()
    population_srs.ImportFromEPSG(_DEFAULT_EPSG)
    population_wkt = population_srs.ExportToWkt()
    pygeoprocessing.numpy_array_to_raster(
        base_array=population_array,
        target_nodata=-1,
        pixel_size=population_pixel_size,
        origin=_DEFAULT_ORIGIN,
        projection_wkt=population_wkt,
        target_path=args['population_raster_path'])

    lulc_pixel_size = _DEFAULT_PIXEL_SIZE
    lulc_array_shape = (30, 30)
    lulc_array = numpy.array(
        random.choices(range(0, 10), k=900),
        dtype=numpy.int32).reshape(lulc_array_shape)
    pygeoprocessing.numpy_array_to_raster(
        base_array=lulc_array,
        target_nodata=-1,
        pixel_size=lulc_pixel_size,
        origin=_DEFAULT_ORIGIN,
        projection_wkt=population_wkt,
        target_path=args['lulc_raster_path'])

    with open(args['lulc_attribute_table'], 'w') as attr_table:
        attr_table.write(textwrap.dedent(
            """\
            lucode,greenspace,search_radius_m
            0,0,100
            1,1,100
            2,0,100
            3,1,100
            4,0,100
            5,1,100
            6,0,100
            7,1,100
            8,0,100
            9,1,100"""))

    admin_geom = [
        shapely.geometry.box(
            *pygeoprocessing.get_raster_info(
                args['lulc_raster_path'])['bounding_box'])]
    pygeoprocessing.shapely_geometry_to_vector(
        admin_geom, args['admin_unit_vector_path'],
        population_wkt, 'GeoJSON')

    return args


class UNATests(unittest.TestCase):
    """Tests for the Urban Nature Access Model."""

    def setUp(self):
        """Override setUp function to create temp workspace directory."""
        # this lets us delete the workspace after its done no matter the
        # the test result
        self.workspace_dir = tempfile.mkdtemp(suffix='\U0001f60e')  # smiley

    def tearDown(self):
        """Override tearDown function to remove temporary directory."""
        shutil.rmtree(self.workspace_dir)

    def test_resample_population_raster(self):
        """UNA: Test population raster resampling."""
        from natcap.invest import urban_nature_access

        random.seed(-1)  # for our random number generation

        source_population_raster_path = os.path.join(
            self.workspace_dir, 'population.tif')
        population_pixel_size = (90, -90)
        population_array_shape = (10, 10)

        array_of_100s = numpy.full(
            population_array_shape, 100, dtype=numpy.uint32)
        array_of_random_ints = numpy.array(
            random.choices(range(0, 100), k=100),
            dtype=numpy.uint32).reshape(population_array_shape)

        for population_array in (
                array_of_100s, array_of_random_ints):
            population_srs = osr.SpatialReference()
            population_srs.ImportFromEPSG(_DEFAULT_EPSG)
            population_wkt = population_srs.ExportToWkt()
            pygeoprocessing.numpy_array_to_raster(
                base_array=population_array,
                target_nodata=-1,
                pixel_size=population_pixel_size,
                origin=_DEFAULT_ORIGIN,
                projection_wkt=population_wkt,
                target_path=source_population_raster_path)

            for target_pixel_size in (
                    (30, -30),  # 1/3 the pixel size
                    (4, -4),  # way smaller
                    (100, -100)):  # bigger
                target_population_raster_path = os.path.join(
                    self.workspace_dir, 'resampled_population.tif')
                urban_nature_access._resample_population_raster(
                    source_population_raster_path,
                    target_population_raster_path,
                    lulc_pixel_size=target_pixel_size,
                    lulc_bb=pygeoprocessing.get_raster_info(
                        source_population_raster_path)['bounding_box'],
                    lulc_projection_wkt=population_wkt,
                    working_dir=os.path.join(self.workspace_dir, 'working'))

                resampled_population_array = (
                    pygeoprocessing.raster_to_numpy_array(
                        target_population_raster_path))

                # There should be no significant loss or gain of population due
                # to warping, but the fact that this is aggregating across the
                # whole raster (lots of pixels) means we need to lower the
                # relative tolerance.
                numpy.testing.assert_allclose(
                    population_array.sum(), resampled_population_array.sum(),
                    rtol=1e-3)

    def test_dichotomous_decay_simple(self):
        """UNA: Test dichotomous decay on a simple case."""
        from natcap.invest import urban_nature_access

        expected_distance = 5
        kernel_filepath = os.path.join(self.workspace_dir, 'kernel.tif')

        urban_nature_access.dichotomous_decay_kernel_raster(
            expected_distance, kernel_filepath)

        expected_array = numpy.array([
            [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
            [0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0],
            [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
            [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
            [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
            [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
            [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
            [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
            [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
            [0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0],
            [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0]], dtype=numpy.uint8)

        extracted_kernel_array = pygeoprocessing.raster_to_numpy_array(
            kernel_filepath)
        numpy.testing.assert_array_equal(
            expected_array, extracted_kernel_array)

    def test_dichotomous_decay_large(self):
        """UNA: Test dichotomous decay on a very large pixel radius."""
        from natcap.invest import urban_nature_access

        # kernel with > 268 million pixels.  This is big enough to force my
        # laptop to noticeably hang while swapping memory on an all in-memory
        # implementation.
        expected_distance = 2**13
        kernel_filepath = os.path.join(self.workspace_dir, 'kernel.tif')

        urban_nature_access.dichotomous_decay_kernel_raster(
            expected_distance, kernel_filepath)

        expected_shape = (expected_distance*2+1, expected_distance*2+1)
        expected_n_1_pixels = math.pi*expected_distance**2

        kernel_info = pygeoprocessing.get_raster_info(kernel_filepath)
        n_1_pixels = 0
        for _, block in pygeoprocessing.iterblocks((kernel_filepath, 1)):
            n_1_pixels += numpy.count_nonzero(block)

        # 210828417 is only a slight overestimate from the area of the circle
        # at this radius: math.pi*expected_distance**2 = 210828714.13315654
        numpy.testing.assert_allclose(
            n_1_pixels, expected_n_1_pixels, rtol=1e-5)
        self.assertEqual(kernel_info['raster_size'], expected_shape)

    def test_density_decay(self):
        """UNA: Test density decay."""
        from natcap.invest import urban_nature_access

        expected_distance = 200
        kernel_filepath = os.path.join(self.workspace_dir, 'kernel.tif')

        urban_nature_access.density_decay_kernel_raster(
            expected_distance, kernel_filepath)

        expected_shape = (expected_distance*2+1,) * 2
        kernel_info = pygeoprocessing.get_raster_info(kernel_filepath)
        kernel_array = pygeoprocessing.raster_to_numpy_array(kernel_filepath)
        self.assertEqual(kernel_info['raster_size'], expected_shape)
        numpy.testing.assert_allclose(
            47123.867,  # obtained from manual inspection
            kernel_array.sum())
        self.assertEqual(0.75, kernel_array.max())
        self.assertEqual(0, kernel_array.min())

    def test_greenspace_budgets(self):
        """UNA: Test the per-capita greenspace budgets functions."""
        from natcap.invest import urban_nature_access

        nodata = urban_nature_access.FLOAT32_NODATA
        greenspace_supply = numpy.array([
            [nodata, 100.5],
            [75, 100]], dtype=numpy.float32)
        greenspace_demand = 50

        population = numpy.array([
            [50, 100],
            [40.75, nodata]], dtype=numpy.float32)

        greenspace_budget = urban_nature_access._greenspace_budget_op(
                greenspace_supply, greenspace_demand)
        expected_greenspace_budget = numpy.array([
            [nodata, 50.5],
            [25, 50]], dtype=numpy.float32)
        numpy.testing.assert_allclose(
            greenspace_budget, expected_greenspace_budget)

        supply_demand = urban_nature_access._greenspace_supply_demand_op(
            greenspace_budget, population)
        expected_supply_demand = numpy.array([
            [nodata, 100 * 50.5],
            [25 * 40.75, nodata]], dtype=numpy.float32)
        numpy.testing.assert_allclose(
            supply_demand, expected_supply_demand)

    def test_core_model(self):
        """UNA: Run through the model with base data."""
        from natcap.invest import urban_nature_access

        args = _build_model_args(self.workspace_dir)

        urban_nature_access.execute(args)

        # Since we're doing a semi-manual alignment step, assert that the
        # aligned LULC and population rasters have the same pixel sizes,
        # origin and raster dimensions.
        # TODO: Remove these assertions once we're using align_and_resize
        # and it works as expected.
        aligned_lulc_raster_info = pygeoprocessing.get_raster_info(
            os.path.join(args['workspace_dir'], 'intermediate',
                         f"aligned_lulc_{args['results_suffix']}.tif"))
        aligned_population_raster_info = pygeoprocessing.get_raster_info(
            os.path.join(
                args['workspace_dir'], 'intermediate',
                f"aligned_population_{args['results_suffix']}.tif"))
        numpy.testing.assert_allclose(
            aligned_lulc_raster_info['pixel_size'],
            aligned_population_raster_info['pixel_size'])
        numpy.testing.assert_allclose(
            aligned_lulc_raster_info['raster_size'],
            aligned_population_raster_info['raster_size'])
        numpy.testing.assert_allclose(
            aligned_lulc_raster_info['geotransform'],
            aligned_population_raster_info['geotransform'])
        numpy.testing.assert_allclose(
            aligned_lulc_raster_info['bounding_box'],
            aligned_population_raster_info['bounding_box'])

        # Check that we're getting the appropriate summary values in the
        # admin units vector.
        admin_vector_path = os.path.join(
            args['workspace_dir'], 'output',
            f"admin_units_{args['results_suffix']}.gpkg")
        admin_vector = gdal.OpenEx(admin_vector_path)
        admin_layer = admin_vector.GetLayer()
        self.assertEqual(admin_layer.GetFeatureCount(), 1)

        # expected field values from eyeballing the results; random seed = 1
        expected_values = {
            'SUP_DEMadm_cap': -17.9078,
            'Pund_adm': 4660.111328,
            'Povr_adm': 415.888885,
        }
        admin_feature = admin_layer.GetFeature(1)
        self.assertEqual(
            expected_values.keys(),
            admin_feature.items().keys()
        )
        for fieldname, expected_value in expected_values.items():
            numpy.testing.assert_allclose(
                admin_feature.GetField(fieldname), expected_value)

        # The sum of the under-and-oversupplied populations should be equal
        # to the total population count.
        population_array = pygeoprocessing.raster_to_numpy_array(
            args['population_raster_path'])
        numpy.testing.assert_allclose(
            (expected_values['Pund_adm'] + expected_values['Povr_adm']),
            population_array.sum())

        admin_vector = None
        admin_layer = None

    def test_split_greenspace(self):
        from natcap.invest import urban_nature_access

        args = _build_model_args(self.workspace_dir)

        # The split greenspace feature requires an extra column in the
        # attribute table.
        attribute_table = pandas.read_csv(args['lulc_attribute_table'])
        new_search_radius_values = {
            value: 30*value for value in range(1, 10, 2)}
        new_search_radius_values[7] = 30 * 9  # make one a duplicate distance.
        attribute_table['search_radius_m'] = attribute_table['lucode'].map(
            new_search_radius_values)
        attribute_table.to_csv(args['lulc_attribute_table'], index=False)

        urban_nature_access.execute(args)

        admin_vector_path = os.path.join(
            args['workspace_dir'], 'output',
            f"admin_units_{args['results_suffix']}.gpkg")
        admin_vector = gdal.OpenEx(admin_vector_path)
        admin_layer = admin_vector.GetLayer()
        self.assertEqual(admin_layer.GetFeatureCount(), 1)

        # expected field values from eyeballing the results; random seed = 1
        expected_values = {
            'SUP_DEMadm_cap': -17.9078,
            'Pund_adm': 4353.370117,
            'Povr_adm': 722.629639,
        }
        admin_feature = admin_layer.GetFeature(1)
        self.assertEqual(
            expected_values.keys(),
            admin_feature.items().keys()
        )
        for fieldname, expected_value in expected_values.items():
            numpy.testing.assert_allclose(
                admin_feature.GetField(fieldname), expected_value)

        # The sum of the under-and-oversupplied populations should be equal
        # to the total population count.
        population_array = pygeoprocessing.raster_to_numpy_array(
            args['population_raster_path'])
        numpy.testing.assert_allclose(
            (expected_values['Pund_adm'] + expected_values['Povr_adm']),
            population_array.sum())

        admin_vector = None
        admin_layer = None

    def test_split_population(self):
        """UNA: test split population optional module."""
        from natcap.invest import urban_nature_access

        args = _build_model_args(self.workspace_dir)

        admin_geom = [
            shapely.geometry.box(
                *pygeoprocessing.get_raster_info(
                    args['lulc_raster_path'])['bounding_box'])]
        fields = {
            'pop_female': ogr.OFTReal,
            'pop_male': ogr.OFTReal,
        }
        attributes = [
            {'pop_female': 0.56, 'pop_male': 0.44}
        ]
        pygeoprocessing.shapely_geometry_to_vector(
            admin_geom, args['admin_unit_vector_path'],
            pygeoprocessing.get_raster_info(
                args['population_raster_path'])['projection_wkt'],
            'GeoJSON', fields, attributes)

        urban_nature_access.execute(args)

        # verify additional rasters exist and have reasonable values relative
        # to the total rasters
        #   undersupply of greenspace
        #   opversupply of greenspace
        # Also, fields must exist in output vector and have correct values.
