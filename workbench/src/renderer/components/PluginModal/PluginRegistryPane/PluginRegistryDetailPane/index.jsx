import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';

import { useTranslation } from 'react-i18next';

import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Spinner from 'react-bootstrap/Spinner';
import Table from 'react-bootstrap/Table';
import { IconContext } from "react-icons";
import { BsExclamationCircle } from "react-icons/bs";
import { BsCheckCircle } from "react-icons/bs";
import { MdCheckCircleOutline } from "react-icons/md";

import { openLinkInBrowser } from '../../../../utils';
import { ipcMainChannels } from '../../../../../main/ipcMainChannels';

const { ipcRenderer } = window.Workbench.electron;

export default function PluginRegistryDetailPane(props) {
  const {
    pluginID,
    plugin,
    installedPluginNames,
    installedPluginNamesVersions,
    addRegistryPlugin,
    installLoading, // true if parent installLoading val == pluginID
    installErr, // true if parent installErr val == pluginID
    installErrMsg,
    installSuccess, // true if parent installSuccess val == pluginID
    installDisabled,
  } = props;
  const [statusMessage, setStatusMessage] = useState('Installing...');
  const [userAcknowledgment, setUserAcknowledgment] = useState(false);
  const [userAcknowledgmentError, setUserAcknowledgmentError] = useState(false);
  const [needsMSVC, setNeedsMSVC] = useState(false);
  const [isInstalledPackage, setIsInstalledPackage] = useState(false);
  const [isInstalledVersion, setIsInstalledVersion] = useState(false);
  
  const registryBaseURL = "https://natcap.github.io/invest-plugin-registry/plugins/"
  const pluginTypes = {
    "preprocessing": "Preprocessing",
    "postprocessing": "Postprocessing",
    "workflow": "Workflow",
    "invest_model_variant": "InVEST Model Variant",
    "new_model": "New Model",
    "other": "Other"
  }

  const clearFormErrors = () => {
    setUserAcknowledgmentError(false);
  };

  useEffect(() => {
      clearFormErrors();
  }, []);

  useEffect(() => {
    if (userAcknowledgment) {
      setUserAcknowledgmentError(false);
    }
  }, [userAcknowledgment]);

  useEffect(() => {
    let packageName = plugin.pyproject_toml.tool.natcap.invest.package_name;
    let version = plugin.version;
    
    if (installedPluginNamesVersions.includes(packageName + '@' + version)) {
      setIsInstalledPackage(true);
      setIsInstalledVersion(true);
    } else if (installedPluginNames.includes(packageName)) {
      setIsInstalledPackage(true);
    }
  }, [installedPluginNames, installedPluginNamesVersions]);

  const handleAddPluginClick = () => {
    clearFormErrors();
    if (validateAddPluginForm()) {
      addRegistryPlugin(pluginID, plugin.github_repo, plugin.version);
    }
  };

  const validateAddPluginForm = () => {
    let formValid = true;
    if (!userAcknowledgment) {
      formValid = false;
      setUserAcknowledgmentError(true);
    }
    return formValid;
  };

  const downloadMSVC = () => {
    closeModal();
    ipcRenderer.invoke(ipcMainChannels.DOWNLOAD_MSVC).then(
      openModal()
    );
  };

  useEffect(() => {
    ipcRenderer.on('plugin-install-status', (msg) => { setStatusMessage(msg); });
    if (window.Workbench.OS === 'win32') {
      ipcRenderer.invoke(ipcMainChannels.HAS_MSVC).then((hasMSVC) => {
        setNeedsMSVC(!hasMSVC);
      });
    }
    return () => { ipcRenderer.removeAllListeners('plugin-install-status'); };
  }, []);

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

  const { t } = useTranslation();

  let installPane = (
    <>
      {isInstalledPackage &&
        <div className="pt-3 plugin-version-note">
          <IconContext.Provider value={{ className: 'react-icons' }}>
            <BsExclamationCircle />
          </IconContext.Provider>
          <span><b>Note:</b> A different version of this plugin is already installed.</span>
        </div>
      }
      <Form aria-labelledby="add-plugin-form-title">
        <Form.Group>
          <Form.Group>
            <Form.Text
              as="span"
              id="plugin-installation-risk-statement"
              className="plugin-form-text"
            >
              {t('As with any third-party software, installing a plugin for use with InVEST '
                + 'may pose a risk to your data, computer, and/or network. Please make sure '
                + 'you trust the authors of the plugin you are installing. If you are '
                + 'installing from a git URL, you are encouraged to review the source code, '
                + 'which can change over time.')}
            </Form.Text>
          </Form.Group>
          <Form.Group>
            <Form.Check
              id={`${pluginID}-user-acknowledgment-checkbox`}
              label={t('I acknowledge and accept the risks associated with installing this plugin.')}
              value={userAcknowledgment}
              onChange={(event) => setUserAcknowledgment(event.target.checked)}
              aria-describedby={`plugin-installation-risk-statement${userAcknowledgmentError ? ' user-acknowledgment-error' : ''}`}
            />
          </Form.Group>
          {userAcknowledgmentError &&
            <Form.Text
              as="p"
              id={`${pluginID}-user-acknowledgment-error`}
              className="plugin-error plugin-user-acknowledgment-error mb-1"
            >
              {t('Error: Before installing a plugin, you must agree to the terms by selecting the checkbox.')}
            </Form.Text>
          }
          <Button
            disabled={installLoading || installDisabled}
            onClick={handleAddPluginClick}
            aria-describedby="plugin-installation-duration-notice"
          >
            {installLoading
              ? (
                <div className="adding-button">
                  <Spinner animation="border" role="status" size="sm" className="plugin-spinner">
                    <span className="visually-hidden">{t('Adding plugin')}</span>
                  </Spinner>
                  {t(statusMessage)}
                </div>
              )
              : t('Add')
            }
          </Button>
          <Form.Text
            as="span"
            muted
            id={`${pluginID}-plugin-installation-duration-notice`}
            className="plugin-form-text"
          >
            {t('This may take several minutes.')}
          </Form.Text>
          <div aria-live="polite">
            {installSuccess &&
              <Form.Text
                as="span"
                className="plugin-success"
              >
                <BsCheckCircle />
                {t('Successfully installed plugin')}
              </Form.Text>
            }
          </div>
        </Form.Group>
      </Form>
    </>
  );
  
  if (needsMSVC) {
    installPane = (
      <>
        <h5>
          {t('Microsoft Visual C++ Redistributable must be installed!')}
        </h5>

        {t('Plugin features require the ')}
        <a href="https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist">
          {t('Microsoft Visual C++ Redistributable')}
        </a>
        {t('. You must download and install the redistributable before continuing.')}

        <Button
          className="mt-3"
          onClick={downloadMSVC}
        >
          {t('Continue to download and install')}
        </Button>
      </>
    );
  } else if (installErr) {
    installPane = (
      <>
        <h5>{t('Error installing plugin:')}</h5>
        <div className="plugin-error plugin-install-remove-error">{installErrMsg}</div>
        <Button
          onClick={() => ipcRenderer.send(
            ipcMainChannels.SHOW_ITEM_IN_FOLDER,
            window.Workbench.ELECTRON_LOG_PATH,
          )}
        >
          {t('Find workbench logs')}
        </Button>
      </>
    );
  };

  let alreadyInstalledPane = (
    <>
      <div className="pt-3 pb-3 plugin-version-note">
        <IconContext.Provider value={{ className: 'react-icons' }}>
          <BsCheckCircle />
        </IconContext.Provider>
        <span>This plugin is installed!</span>
      </div>
    </>
  );

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
              <td>
                {keywords}
              </td>
            </tr>
          </tbody>
        </Table>
      </div>
      <div className="install-pane registry-install-form">
        {isInstalledVersion
          ? alreadyInstalledPane
          : installPane
        }
      </div>
    </>
  );
}