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
    registryData,
    pluginSortOrder,
    activePluginKey,
    handlePluginClick,
    fetchError,
    installedPlugins,
    addRegistryPlugin,
    installLoading,
    installErr,
    installErrMsg,
    installSuccess,
  } = props;
  const [installedPluginNames, setInstalledPluginNames] = useState([]);
  const [installedPluginNamesVersions, setInstalledPluginNamesVersions] = useState([]);
  const [plugins, setPlugins] = useState({});

  const { t } = useTranslation();

  useEffect(() => {
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
            key={activePluginKey}
            pluginID={activePluginKey}
            plugin={registryData[activePluginKey]}
            installedPluginNames={installedPluginNames}
            installedPluginNamesVersions={installedPluginNamesVersions}
            addRegistryPlugin={addRegistryPlugin}
            installLoading={installLoading == activePluginKey}
            installErr={installErr == activePluginKey}
            installErrMsg={installErrMsg}
            installSuccess={installSuccess == activePluginKey}
            installDisabled={installLoading && installLoading != activePluginKey}
          />
        }
      </Col>
    </Row>
  );
}