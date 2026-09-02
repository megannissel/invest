import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';

import { useTranslation } from 'react-i18next';

import Col from 'react-bootstrap/Col';
import Row from 'react-bootstrap/Row';
import { IconContext } from "react-icons";
import { MdOutlineWarningAmber } from "react-icons/md";

import { getPluginRegistryData } from '../../../server_requests';
import PluginRegistryDetailPane from './PluginRegistryDetailPane';

const { ipcRenderer } = window.Workbench.electron;

export default function PluginRegistryTab(props) {
  const {
    installedPlugins,
    updateInvestList,
  } = props;
  const [registryData, setRegistryData] = useState([]);
  const [pluginSortOrder, setPluginSortOrder] = useState([]);
  const [activePluginKey, setActivePluginKey] = useState('');
  const [fetchError, setFetchError] = useState(false);
  const [installedPluginNames, setInstalledPluginNames] = useState([]);
  const [installedPluginNamesVersions, setInstalledPluginNamesVersions] = useState([]);
  const [plugins, setPlugins] = useState({});

  const registryMetadataURL = "https://natcap.github.io/invest-plugin-registry/metadata.json";
  const dataCacheKey = "registryData";
  const cacheTimeout = 1000 * 60 * 60 * 24; // 24 hours

  const { t } = useTranslation();

  async function fetchRegistryData() {
    //localStorage.removeItem(dataCacheKey); // Uncomment to clear localStorage
    let cacheJSON = null;
    let cacheStale = true;

    // Check if data is cached in Local Storage
    const cachedData = localStorage.getItem(dataCacheKey);

    if (cachedData) {
      cacheJSON = JSON.parse(cachedData);
      if (Date.now() - cacheJSON.cacheDate < cacheTimeout) {
        cacheStale = false;
      }
    }

    if (cacheJSON && !cacheStale) {
        console.log('Using cached data');
        setRegistryData(cacheJSON.data);
        //setFetchError(true); // Uncomment to test error state
    } else {
      console.log('Cache miss; fetching data...');
      try {
        // Fetch data from the Registry if not cached
        const response = await fetch(registryMetadataURL);
        if (!response.ok) {
          throw new Error(`Response status: ${response.status}`);
        }
        const pluginJSON = await response.json();
        const cacheData = Object({
          'data': pluginJSON.data,
          'cacheDate': Date.now()
        });

        // Cache the data in localStorage
        localStorage.setItem(dataCacheKey, JSON.stringify(cacheData));

        setRegistryData(pluginJSON.data);
        setFetchError(false);
      } catch (error) {
        console.log(error.message);
        setFetchError(true);
      }
    }
  }

  useEffect(() => {
    fetchRegistryData();
  }, []);

  function sortByName(a, b) {
    if (a[1] > b[1]) {
      return 1;
    }
    return -1;
  }

  useEffect(() => {
    if (Object.keys(registryData).length) {
      const toSort = [];
      for (const pluginID in registryData) {
        toSort.push([pluginID, registryData[pluginID].plugin_name])
      };
      const sorted = toSort.sort(sortByName);
      setPluginSortOrder(sorted);
      setActivePluginKey(sorted[0][0]);
    }
  }, [registryData]);

  // function fetchInstalledPlugins() {
  //   ipcRenderer.invoke(ipcMainChannels.GET_SETTING, 'plugins').then(
  //     (data) => {
  //       if (data) {
  //         setPlugins(data);
  //       }
  //     }
  //   );
  // }

  useEffect(() => {
  //   fetchInstalledPlugins();
    let installedPluginNameList = [];
    let installedPluginNameVersionList = [];
    for (const pluginID in installedPlugins) {
      let p = installedPlugins[pluginID];
      if (p.hasOwnProperty('packageName')) {
        installedPluginNameVersionList.push(p.packageName + "@" + p.version);
        installedPluginNameList.push(p.packageName);
      }
    };
    setInstalledPluginNames(installedPluginNameList);
    setInstalledPluginNamesVersions(installedPluginNameVersionList);
  }, [installedPlugins]);

  // let installedPluginNameList = [];
  // let installedPluginNameVersionList = [];
  // for (const pluginID in installedPlugins) {
  //   let p = installedPlugins[pluginID];
  //   if (p.hasOwnProperty('packageName')) {
  //     installedPluginNameVersionList.push(p.packageName + "@" + p.version);
  //     installedPluginNameList.push(p.packageName);
  //   }
  // };

  function handlePluginClick(pluginKey) {
    setActivePluginKey(pluginKey);
  }

  const pluginList = [];
  for (const [pluginID, pluginName] of pluginSortOrder) {
    const listItem = (
      <button
        key={pluginID}
        size="lg"
        className={`registry-list-group-item plugin-registry-button ${activePluginKey === pluginID ? 'active' : ''}`}
        onClick={(e) => handlePluginClick(pluginID)}
      >
        {pluginName}
      </button>
    )
    pluginList.push(listItem);
  };

  return (
    <Row>
      {fetchError ? (
        <div className="registry-fetch-error">
          <IconContext.Provider value={{ className: 'registry-warning-icon' }}>
            <MdOutlineWarningAmber />
          </IconContext.Provider>
          <p>
            {t(`An error occurred when loading the Plugin Registry data.
              Please check your internet connection, then try again.
              If the problem persists, consider reporting it on the NatCap Community Forum.`)}
          </p>
        </div>
      ) : (
        <>
          <Col sm={3} className="registry-list registry-list-group">
            {pluginList.length
              ? (
                <div className="d-grid">
                  {pluginList}
                </div>
              )
              : (
                <p>No plugins found</p>
              )
            }
          </Col>
          <Col sm={9} className="registry-pane">
            {activePluginKey.length &&
              <PluginRegistryDetailPane
                key={`${activePluginKey}-details`}
                pluginID={activePluginKey}
                plugin={registryData[activePluginKey]}
                installedPluginNames={installedPluginNames}
                installedPluginNamesVersions={installedPluginNamesVersions}
                updateInvestList={updateInvestList}
              />
            }
          </Col>
        </>
      )}
    </Row>
  );
}
