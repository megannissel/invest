"""Buffered file manager module."""

import uuid
import time
import collections
import os
import logging
import multiprocessing
import sqlite3

import numpy

from ._utils import _numpy_dumps, _numpy_loads
from .. import utils


LOGGER = logging.getLogger(
    'natcap.invest.recmodel_server.buffered_numpy_disk_map')

def _npy_append(filepath, array):
    with open(filepath, 'rb+') as file:
        version = numpy.lib.format.read_magic(file)
        header = numpy.lib.format._read_array_header(file, version)
        d = {
            'shape': header[0],
            'fortran_order': header[1],
            'descr': numpy.lib.format.dtype_to_descr(header[2])
        }
        n = d['shape'][0] + array.size
        d['shape'] = (n, )
        file.seek(0, 2)  # go to end to append data
        file.write(array)
        file.seek(0, 0)  # go to start to re-write header
        numpy.lib.format._write_array_header(file, d, version)

class BufferedNumpyDiskMap(object):
    """Persistent object to append and read numpy arrays to unique keys.

    This object is abstractly a key/value pair map where the operations are
    to append, read, and delete numpy arrays associated with those keys.  The
    object attempts to keep data in RAM as much as possible and saves data to
    files on disk to manage memory and persist between instantiations.
    """

    _ARRAY_TUPLE_TYPE = numpy.dtype('datetime64[D],a4,f4,f4')

    def __init__(self, manager_filename, max_bytes_to_buffer, n_workers=1):
        """Create file manager object.

        Args:
            manager_filename (string): path to store file manager database.
                Additional files will be created in this directory to store
                binary data as needed.
            max_bytes_to_buffer (int): number of bytes to hold in memory at
                one time.
            n_workers (int): if great than 1, number of child processes to
                use during flushes to disk

        Returns:
            None
        """
        self.n_workers = n_workers
        self.manager_filename = manager_filename
        self.manager_directory = os.path.dirname(manager_filename)
        utils.make_directories([self.manager_directory])
        db_connection = sqlite3.connect(
            manager_filename, detect_types=sqlite3.PARSE_DECLTYPES)
        db_cursor = db_connection.cursor()
        db_cursor.execute("""CREATE TABLE IF NOT EXISTS array_table
            (array_id INTEGER PRIMARY KEY, array_path TEXT)""")

        db_connection.commit()
        db_connection.close()

        self.array_cache = collections.defaultdict(collections.deque)
        self.max_bytes_to_buffer = max_bytes_to_buffer
        self.current_bytes_in_system = 0

    def append(self, array_id, array_data):
        """Append data to the file.

        Args:
            array_id (int): unique key to identify the array node
            array_data (numpy.ndarray): data to append to node.

        Returns:
            None
        """
        # self.array_cache[array_id].append(array_data.copy())
        self.array_cache[array_id].append(_numpy_dumps(array_data))
        self.current_bytes_in_system += (
            array_data.size * BufferedNumpyDiskMap._ARRAY_TUPLE_TYPE.itemsize)
        if self.current_bytes_in_system > self.max_bytes_to_buffer:
            self.flush()

    def _write(self, array_id_list):
        db_connection = sqlite3.connect(
            self.manager_filename, detect_types=sqlite3.PARSE_DECLTYPES)
        db_cursor = db_connection.cursor()
        LOGGER.debug(f'WRITE with list: {array_id_list}')
        insert_list = []
        if not isinstance(array_id_list, list):
            array_id_list = [array_id_list]
        for array_id in array_id_list:
            array_deque = collections.deque(_numpy_loads(x) for x in self.array_cache[array_id])
            # try to get data if it's there
            db_cursor.execute(
                """SELECT (array_path) FROM array_table
                    where array_id=? LIMIT 1""", [array_id])
            array_path = db_cursor.fetchone()
            if array_path is not None:
                _npy_append(array_path[0], numpy.concatenate(array_deque))
                array_deque = None
                # cache gets wiped at end so okay to use same deque
                # array_deque.append(numpy.load(array_path[0]))
                # array_data = numpy.concatenate(array_deque)
                # array_deque = None
                # numpy.save(array_path[0], array_data)
            else:
                # otherwise directly write
                # make a random filename and put it one directory deep named
                # off the last two characters in the filename
                array_filename = uuid.uuid4().hex + '.npy'
                # -6:-4 skips the extension and gets the last 2 characters
                array_directory = os.path.join(
                    self.manager_directory, array_filename[-6:-4])
                if not os.path.isdir(array_directory):
                    os.mkdir(array_directory)
                array_path = os.path.join(array_directory, array_filename)
                # save the file
                array_data = numpy.concatenate(array_deque)
                array_deque = None
                numpy.save(array_path, array_data)
                insert_list.append((array_id, array_path))
        db_connection.close()
        return insert_list

    def flush(self):
        """Method to flush data in memory to disk."""
        start_time = time.time()
        LOGGER.info(
            'Flushing %d bytes in %d arrays', self.current_bytes_in_system,
            len(self.array_cache))

        array_id_list = list(self.array_cache)

        n_workers = self.n_workers if self.n_workers <= len(array_id_list) else len(array_id_list)
        LOGGER.debug(f'N_WORKERS for flush: {n_workers}')
        if n_workers > 1:
            with multiprocessing.Pool(processes=self.n_workers) as pool:
                insert_list_of_lists = pool.map(self._write, array_id_list)
            pool.close()
            pool.join()
            insert_list = [x for xs in insert_list_of_lists for x in xs]
        else:
            insert_list = self._write(array_id_list)
        for array_id in array_id_list:
            del self.array_cache[array_id]

        db_connection = sqlite3.connect(
            self.manager_filename, detect_types=sqlite3.PARSE_DECLTYPES)
        db_cursor = db_connection.cursor()
        db_cursor.executemany(
            """INSERT INTO array_table
                (array_id, array_path)
            VALUES (?,?)""", insert_list)

        db_connection.commit()
        db_connection.close()

        self.current_bytes_in_system = 0
        LOGGER.info('Completed flush in %.2fs', time.time() - start_time)

    def read(self, array_id):
        """Read the entirety of the file.

        Internally this might mean that part of the file is read from disk
        and the end from the buffer or any combination of those.

        Args:
            array_id (string): unique node id to read

        Returns:
            contents of node as a numpy.ndarray.
        """
        db_connection = sqlite3.connect(
            self.manager_filename, detect_types=sqlite3.PARSE_DECLTYPES)
        db_cursor = db_connection.cursor()
        db_cursor.execute(
            "SELECT (array_path) FROM array_table where array_id=? LIMIT 1",
            [array_id])
        array_path = db_cursor.fetchone()
        db_connection.close()

        if array_path is not None:
            array_data = numpy.load(array_path[0])
        else:
            array_data = numpy.empty(
                0, dtype=BufferedNumpyDiskMap._ARRAY_TUPLE_TYPE)

        if len(self.array_cache[array_id]) > 0:
            local_deque = collections.deque(_numpy_loads(x) for x in self.array_cache[array_id])
            local_deque.append(array_data)
            array_data = numpy.concatenate(local_deque)

        return array_data

    def delete(self, array_id):
        """Delete node `array_id` from disk and cache."""
        db_connection = sqlite3.connect(
            self.manager_filename, detect_types=sqlite3.PARSE_DECLTYPES)
        db_cursor = db_connection.cursor()
        db_cursor.execute(
            "SELECT (array_path) FROM array_table where array_id=? LIMIT 1",
            [array_id])
        array_path = db_cursor.fetchone()
        if array_path is not None:
            os.remove(array_path[0])
            try:
                # attempt to remove the directory if it's empty
                os.rmdir(os.path.dirname(array_path[0]))
            except OSError:
                # it's not empty, not a big deal
                pass

        # delete the key from the table
        db_cursor.execute(
            "DELETE FROM array_table where array_id=?", [array_id])
        db_connection.close()

        # delete the cache and update cache size
        self.current_bytes_in_system -= (
            sum([_numpy_loads(x).size for x in self.array_cache[array_id]]) *
            BufferedNumpyDiskMap._ARRAY_TUPLE_TYPE.itemsize)
        del self.array_cache[array_id]
