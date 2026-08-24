import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';

import { useTranslation } from 'react-i18next';

import Button from 'react-bootstrap/Button';
import Card from 'react-bootstrap/Card';
import Col from 'react-bootstrap/Col';
import Container from 'react-bootstrap/Container';
import Form from 'react-bootstrap/Form';
import Row from 'react-bootstrap/Row';
import Table from 'react-bootstrap/Table';
import { HiChevronDown } from "react-icons/hi";
import { HiChevronUp } from "react-icons/hi";
import { MdOutlineCheckCircle } from "react-icons/md";

import { openLinkInBrowser } from '../../../utils';
import { getPluginRegistryData } from '../../../server_requests';


function PluginPane(props) {
  const {
    pluginID,
    plugin,
    installed,
    installForm
  } = props;
  const registryBaseURL = "https://natcap.github.io/invest-plugin-registry/plugins/"
  const pluginTypes = {
    "preprocessing": "Preprocessing",
    "postprocessing": "Postprocessing",
    "workflow": "Workflow",
    "invest_model_variant": "InVEST Model Variant",
    "new_model": "New Model",
    "other": "Other"
  }

  const { t } = useTranslation();

  function extractAuthorsMaintainers(plugin, k) {
    let people = null;

    if (plugin.pyproject_toml.project.hasOwnProperty(k)) {
      let devList = plugin.pyproject_toml.project[k];
      people = devList.map((x) => x.name ? x.name : x.email).join("; ");
    }
    return people
  }

  const authors = extractAuthorsMaintainers(plugin, "authors");
  const maintainers = extractAuthorsMaintainers(plugin, "maintainers");

  const pluginType = pluginTypes[plugin.plugin_type];
  const keywords = [pluginType].concat(plugin.keywords).join(", ");

  return (
    <>
    <div className="plugin-pane">
      <h5>{plugin.plugin_name}</h5>
      <p className="plugin-description">
        {plugin.pyproject_toml.project.description}
      </p>
      <Table borderless size="sm" className="plugin-description plugin-table">
        <tbody>
          <tr>
            <td className="text-end"><b>Downloads:</b></td>
            <td>
              30
            </td>
          </tr>
          {authors &&
          <tr>
            <td className="text-end"><b>Authors:</b></td>
            <td>
              {authors}
            </td>
          </tr>
          }
          {maintainers &&
          <tr>
            <td className="text-end"><b>Maintainers:</b></td>
            <td>
              {maintainers}
            </td>
          </tr>
          }
          <tr>
            <td className="text-end"><b>Version:</b></td>
            <td>
              {plugin.version}
            </td>
          </tr>
          <tr>
            <td className="text-end"><b>License:</b></td>
            <td>
              {plugin.pyproject_toml.project.license}
            </td>
          </tr>
          <tr>
            <td className="text-end"><b>More Info:</b></td>
            <td>
              <a
                href={`${registryBaseURL}${pluginID}.html`}
                title={`${registryBaseURL}${pluginID}.html`}
                aria-label={t("View on Plugin Registry (opens in web browser)")}
                onClick={openLinkInBrowser}
              >View on Registry</a> | <a
                href={plugin.pyproject_toml.project.urls.Repository}
                title={plugin.pyproject_toml.project.urls.Repository}
                aria-label={t("Plugin source code (opens in web browser)")}
                onClick={openLinkInBrowser}
              >Source Code</a> | <a
                href={plugin.pyproject_toml.project.urls.Documentation}
                title={plugin.pyproject_toml.project.urls.Documentation}
                aria-label={t("Plugin documentation (opens in web browser)")}
                onClick={openLinkInBrowser}
              >Documentation</a> | <a
                href={plugin.pyproject_toml.project.urls.Issues}
                title={plugin.pyproject_toml.project.urls.Issues}
                aria-label={t("Plugin issue tracker (opens in web browser)")}
                onClick={openLinkInBrowser}
              >Issue Tracker</a>
            </td>
          </tr>
          <tr>
            <td className="text-end"><b>Tags:</b></td>
              {keywords}
            <td>
            </td>
          </tr>
        </tbody>
      </Table>
    </div>
    <div className="install-pane registry-install-form">
      <Form aria-labelledby="add-plugin-form-title">
        <Form.Group>
          <Form.Control
            className="hidden-input"
            id="url"
            readOnly
            defaultValue={plugin.github_repo}
          />
          <Form.Control
            className="hidden-input"
            id="branch"
            readOnly
            defaultValue={plugin.version}
          />
          {installForm}
        </Form.Group>
      </Form>
    </div>
    </>
  );
}


export default function PluginRegistryTab(props) {
  const {
    installedPlugins,
    installForm
  } = props;
  const [registryData, setRegistryData] = useState([]);
  const [activePluginKey, setActivePluginKey] = useState('');

  const { t } = useTranslation();

  async function loadPluginRegistryData() {
    const registryData = await getPluginRegistryData();
    setRegistryData(registryData);
    console.log(registryData);
  }

  useEffect(() => {
    loadPluginRegistryData();
  }, []);

  useEffect(() => {
    if (Object.keys(registryData).length) {
      setActivePluginKey(Object.keys(registryData)[0]);
    }
  }, [registryData]);

  let installedPluginKeys = Object.keys(installedPlugins);
  const names = []
  if (installedPluginKeys.length) {
    for (const id of installedPluginKeys) {
      const name = id.split("@");
      names.push(name[0]);
    }
  }

  function handlePluginClick(pluginKey) {
    setActivePluginKey(pluginKey);
  }

  const pluginList = [];
  for (const pluginID in registryData) {
    let p = registryData[pluginID]
    const listItem = (
      <button
        key={pluginID}
        size="lg"
        className={`registry-list-group-item plugin-registry-button ${activePluginKey === pluginID ? 'active' : ''}`}
        onClick={(e) => handlePluginClick(pluginID)}
      >
        {p.plugin_name}
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
          <PluginPane
            pluginID={activePluginKey}
            plugin={registryData[activePluginKey]}
            installed={names.includes(activePluginKey)}
            installForm={installForm}
          />
        }
      </Col>
    </Row>
  );
}
