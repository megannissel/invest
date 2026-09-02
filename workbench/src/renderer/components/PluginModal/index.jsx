import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';

import Button from 'react-bootstrap/Button';
import Col from 'react-bootstrap/Col';
import Container from 'react-bootstrap/Container';
import Form from 'react-bootstrap/Form';
import Modal from 'react-bootstrap/Modal';
import Nav from 'react-bootstrap/Nav';
import Row from 'react-bootstrap/Row';
import Spinner from 'react-bootstrap/Spinner';
import Tab from 'react-bootstrap/Tab';
import Tabs from 'react-bootstrap/Tabs';
import TabPane from 'react-bootstrap/TabPane';
import TabContent from 'react-bootstrap/TabContent';
import TabContainer from 'react-bootstrap/TabContainer';
import { useTranslation } from 'react-i18next';
import { IconContext } from "react-icons";
import {
  MdCheckCircleOutline,
  MdClose,
  MdFolderOpen,
  MdOutlineWarningAmber
} from 'react-icons/md';

import { openLinkInBrowser } from '../../utils';
import { ipcMainChannels } from '../../../main/ipcMainChannels';

import { mockRegistryData } from './mockRegistryData';
import PluginRegistryTab from './PluginRegistryTab';

const { getFilePath, ipcRenderer } = window.Workbench.electron;

export default function PluginModal(props) {
  const {
    updateInvestList,
    closeInvestModel,
    openJobs,
    show,
    closeModal,
    openModal,
  } = props;
  const [url, setURL] = useState('');
  const [revision, setRevision] = useState('');
  const [path, setPath] = useState('');
  const [condaPath, setCondaPath] = useState('');
  const [pluginEnvs, setPluginEnvs] = useState({});

  const [installFrom, setInstallFrom] = useState('url');
  const [installLoading, setInstallLoading] = useState('');
  const [installErr, setInstallErr] = useState('');
  const [installErrMsg, setInstallErrMsg] = useState('');
  const [installSuccess, setInstallSuccess] = useState('');

  const [userAcknowledgment, setUserAcknowledgment] = useState(false);
  const [userAcknowledgmentError, setUserAcknowledgmentError] = useState(false);
  const [pluginSourceMissingError, setPluginSourceMissingError] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [needsMSVC, setNeedsMSVC] = useState(false);

  const [pluginToRemove, setPluginToRemove] = useState('');
  const [uninstallLoading, setUninstallLoading] = useState(false);
  const [uninstallErr, setUninstallErr] = useState('');
  const [removalSuccess, setRemovalSuccess] = useState(false);

  const [plugins, setPlugins] = useState({});
  const [registryData, setRegistryData] = useState([]);
  const [activePluginKey, setActivePluginKey] = useState('');
  const [activePluginIndex, setActivePluginIndex] = useState(0);
  const [fetchError, setFetchError] = useState(false);

  const registryMetadataURL = "https://natcap.github.io/invest-plugin-registry/metadata.json";
  const dataCacheKey = "registryData";
  const cacheTimeout = 1000 * 60 * 60 * 24; // 24 hours
  const manualInstallID = 'manualInstall';

  const handleModalClose = () => {
    setURL('');
    setRevision('');
    setInstallErr('');
    setUninstallErr('');
    clearFormErrors();
    setInstallSuccess(false);
    setRemovalSuccess(false);
    closeModal();
  };

  const clearFormErrors = () => {
    setUserAcknowledgmentError(false);
    setPluginSourceMissingError(false);
  };

  function sortByName(a, b) {
    if (a.plugin_name > b.plugin_name) {
      return 1;
    }
    return -1;
  }

  async function fetchRegistryData() {
    //localStorage.removeItem(dataCacheKey); // Uncomment to clear localStorage
    let cacheJSON = null;
    let cacheStale = true;

    // Check if data is cached in localStorage
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
        setFetchError(false);
        //setFetchError(true); // Uncomment to test error state
    } else {
      console.log('Cache miss; fetching data...');
      try {
        // Fetch data from the Registry if not cached
        // const response = await fetch(registryMetadataURL);
        // if (!response.ok) {
        //   throw new Error(`Response status: ${response.status}`);
        // }
        // const pluginJSON = await response.json();
        // const sortedPlugins = pluginJSON.data.sort(sortByName);

        // MOCKING FOR NEW DATA STRUCTURE:
        let pluginJSON = mockRegistryData;
        let sortedPlugins = pluginJSON.data.sort(sortByName);
        // END MOCKING FOR NEW DATA STRUCTURE

        const cacheData = Object({
          'data': sortedPlugins,
          'cacheDate': Date.now()
        });

        // Cache the data in localStorage
        localStorage.setItem(dataCacheKey, JSON.stringify(cacheData));

        setRegistryData(sortedPlugins);
        setFetchError(false);
      } catch (error) {
        console.log(error.message);
        setFetchError(true);
      }
    }
  }

  const handleRetryFetchRegistryData = () => {
    setFetchError(false);
    fetchRegistryData();
  }

  useEffect(() => {
    fetchRegistryData();
  }, []);

  useEffect(() => {
    if (Object.keys(registryData).length) {
      setActivePluginKey(registryData[0]['invest_package_name']);
      setActivePluginIndex(0);
    }
  }, [registryData]);

  function handlePluginClick(pluginKey) {
    setActivePluginKey(pluginKey);
    setActivePluginIndex(registryData.findIndex(i => i.invest_package_name === pluginKey));
  }

  useEffect(() => {
    Promise.all([
      ipcRenderer.invoke(ipcMainChannels.GET_SETTING, 'micromamba'),
      ipcRenderer.invoke(ipcMainChannels.GET_SETTING, 'userDefinedMicromamba')
    ]).then(([micromamba, userDefinedMicromamba]) => {
      setCondaPath(userDefinedMicromamba || micromamba);
    });
    ipcRenderer.invoke(
      ipcMainChannels.GET_SETTING, 'plugins'
    ).then((data) => setPluginEnvs(
      Object.fromEntries(
        Object.keys(data).map(
          (pluginID) => [pluginID, data[pluginID].userDefinedEnv || data[pluginID].env]
        )
      )
    ))
  }, []);

  useEffect(() => {
    clearFormErrors();
  }, [installFrom]);

  useEffect(() => {
    if (pluginSourceMissingError) {
      setPluginSourceMissingError(false);
    }
  }, [url, path]);

  useEffect(() => {
    if (userAcknowledgment) {
      setUserAcknowledgmentError(false);
    }
  }, [userAcknowledgment]);

  const handleAddPluginClick = () => {
    clearFormErrors();
    if (validateAddPluginForm()) {
      addPlugin();
    }
  };

  const validateAddPluginForm = () => {
    let formValid = true;
    if ((installFrom === 'url' && !url)
        || (installFrom === 'path' && !path)
    ) {
      formValid = false;
      setPluginSourceMissingError(true);
    }
    if (!userAcknowledgment) {
      formValid = false;
      setUserAcknowledgmentError(true);
    }
    return formValid;
  };

  const addPlugin = () => {
    setInstallSuccess('');
    setRemovalSuccess(false);
    setInstallLoading(manualInstallID);
    ipcRenderer.invoke(
      ipcMainChannels.ADD_PLUGIN,
      installFrom === 'url' ? url : undefined, // url
      installFrom === 'url' ? revision : undefined, // revision
      installFrom === 'path' ? path : undefined, // path
      installFrom === 'path' ? 'plugin_local' : 'plugin_git' // source type
    ).then(() => {
      setInstallLoading('');
      updateInvestList();
      setInstallSuccess(manualInstallID);
      // clear the input fields
      setURL('');
      setRevision('');
      setPath('');
      fetchInstalledPlugins();
    }).catch((err) => {
      setInstallErrMsg(err.toString());
      setInstallErr(manualInstallID);
    });
  };

  const addRegistryPlugin = (pluginID, githubRepo, version) => {
    setInstallSuccess('');
    setInstallLoading(pluginID);
    ipcRenderer.invoke(
      ipcMainChannels.ADD_PLUGIN,
      githubRepo, // url
      version, // revision
      undefined, // local path; not used for Registry-based install
      'plugin_registry' // source type
    ).then(() => {
      setInstallLoading('');
      updateInvestList();
      setInstallSuccess(pluginID);
    }).catch((err) => {
      setInstallErrMsg(err.toString());
      setInstallErr(pluginID);
      setInstallLoading('');
    });
  };

  const handleResetForm = () => {
    setInstallErr('');
    setInstallLoading('');
  }

  const removePlugin = () => {
    setRemovalSuccess(false);
    setInstallSuccess('');
    setUninstallLoading(true);
    openJobs.forEach((job, tabID) => {
      if (job.modelID === pluginToRemove) {
        closeInvestModel(tabID);
      }
    });
    ipcRenderer.invoke(
      ipcMainChannels.REMOVE_PLUGIN, pluginToRemove
    ).then(() => {
      setRemovalSuccess(true);
      updateInvestList();
      setUninstallLoading(false);
    }).catch((err) => {
      setUninstallErr(err.toString());
    });
  };

  const downloadMSVC = () => {
    closeModal();
    ipcRenderer.invoke(ipcMainChannels.DOWNLOAD_MSVC).then(
      openModal()
    );
  };

  const resetCondaPath = () => {
    ipcRenderer.invoke(
      ipcMainChannels.GET_SETTING, 'micromamba'
    ).then((data) => {
      setCondaPath(data);
    });
  };

  const saveCondaPath = () => {
    ipcRenderer.send(
      ipcMainChannels.SET_SETTING, 'userDefinedMicromamba', condaPath
    );
  };

  const resetPluginEnv = (pluginID) => {
    ipcRenderer.invoke(
      ipcMainChannels.GET_SETTING, `plugins.${pluginID}.env`
    ).then((value) => {
      setPluginEnvs({...pluginEnvs, [pluginID]: value});
    });
  };

  const savePluginEnvs = () => {
    Object.entries(pluginEnvs).forEach(([pluginID, envPath]) => {
      ipcRenderer.send(
        ipcMainChannels.SET_SETTING, `plugins.${pluginID}.userDefinedEnv`, envPath
      );
    });
  };

  const selectDirectory = async (event) => {
    const data = await ipcRenderer.invoke(
      ipcMainChannels.SHOW_OPEN_DIALOG, { properties: ['openDirectory'] }
    );
    if (data.filePaths.length) {
      return data.filePaths[0];
    }
  };

  /**
   * Prevent the default case for onDragOver so onDrop event will be fired.
   *
   * @param {Event} event - dragover event
   */
  function dragOverHandler(event) {
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.disabled) {
      event.dataTransfer.dropEffect = 'none';
    } else {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  function getDroppedFilePath(event) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.classList.remove('input-dragging');
  
    if (event.currentTarget.disabled) {
      return undefined;
    }
  
    const fileList = event.dataTransfer.files;
    if (fileList.length !== 1) {
      //return undefined;
      alert(t('Only drop one file at a time.')); // eslint-disable-line no-alert
      return undefined;
    } 
    
    event.currentTarget.focus();
    return getFilePath(fileList[0]);
  }

  const rejectDropHandler = (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'none';
    event.currentTarget.classList.remove('input-dragging');
  };

  function dragEnterHandler(event) {
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.disabled) {
      event.dataTransfer.dropEffect = 'none';
    } else {
      event.dataTransfer.dropEffect = 'copy';
      event.currentTarget.classList.add('input-dragging');
    }
  }

  function dragLeavingHandler(event) {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
    event.currentTarget.classList.remove('input-dragging');
  }

  const selectFile = async (event) => {
    const data = await ipcRenderer.invoke(
      ipcMainChannels.SHOW_OPEN_DIALOG, { properties: ['openFile'] }
    );
    if (data.filePaths.length) {
      return data.filePaths[0];
    }
  };

  useEffect(() => {
    ipcRenderer.on('plugin-install-status', (msg) => { setStatusMessage(msg); });
    if (show) {
      if (window.Workbench.OS === 'win32') {
        ipcRenderer.invoke(ipcMainChannels.HAS_MSVC).then((hasMSVC) => {
          setNeedsMSVC(!hasMSVC);
        });
      }
    }
    return () => { ipcRenderer.removeAllListeners('plugin-install-status'); };
  }, [show]);

  useEffect(() => {
    ipcRenderer.invoke(ipcMainChannels.GET_SETTING, 'plugins').then(
      (data) => {
        if (data) {
          setPlugins(data);
          setPluginToRemove(Object.keys(data)[0]);
        }
      }
    );
  }, [installLoading, uninstallLoading]);

  const { t } = useTranslation();

  let pluginFields;
  if (installFrom === 'url') {
    pluginFields = (
      <Row>
        <Form.Group as={Col} xs={7}>
          <Form.Label htmlFor="url">{t('Git URL')}</Form.Label>
          <Form.Control
            id="url"
            type="text"
            placeholder="https://github.com/owner/repo.git"
            value={url}
            onChange={(event) => setURL(event.currentTarget.value)}
            onDragOver={rejectDropHandler}
            onDrop={rejectDropHandler}
            aria-describedby={`about-git-url${pluginSourceMissingError ? ' url-error' : ''}`}
          />
          <Form.Text
            as="span"
            muted
            id="about-git-url"
            className="plugin-form-text text-italic"
          >
            {t('Default branch used unless otherwise specified.')}
          </Form.Text>
          {
            pluginSourceMissingError
            &&
            <Form.Text
              as="span"
              id="url-error"
              className="plugin-error plugin-source-missing-error"
            >
              {t('Error: URL is required.')}
            </Form.Text>
          }
        </Form.Group>
        <Form.Group as={Col}>
          <Form.Label htmlFor="branch">{t('Branch, tag, or commit')}</Form.Label>
          <Form.Control
            id="branch"
            type="text"
            value={revision}
            onChange={(event) => setRevision(event.currentTarget.value)}
            aria-describedby="about-branch-tag-commit"
          />
          <Form.Text
            as="span"
            muted
            id="about-branch-tag-commit"
            className="plugin-form-text text-italic"
          >
            {t('Optional')}
          </Form.Text>
        </Form.Group>
      </Row>
    );
  } else {
    pluginFields = (
      <Form.Group>
        <Form.Label htmlFor="path">{t('Local absolute path')}</Form.Label>
        <div className="d-flex flex-nowrap w-100">
          <Form.Control
            id="path"
            type="text"
            placeholder={window.Workbench.OS === 'darwin'
              ? '/Users/username/path/to/plugin/'
              : 'C:\\Documents\\path\\to\\plugin\\'}
            value={path}
            onChange={(event) => setPath(event.currentTarget.value)}
            onDragOver={dragOverHandler}
            onDragEnter={dragEnterHandler}
            onDragLeave={dragLeavingHandler}
            onDrop={(event) => {
              const droppedPath = getDroppedFilePath(event);
              if (droppedPath) {
                setPath(droppedPath);
              }
            }}
            aria-describedby={pluginSourceMissingError ? 'path-error' : ''}
          />
          <Button
            aria-label="browse for plugin directory"
            className="browse-button ms-2"
            variant="outline-dark"
            onClick={async (event) => setPath(await selectDirectory(event) || path)}
          >
            <MdFolderOpen />
          </Button>
        </div>
        {
          pluginSourceMissingError
          &&
          <Form.Text
            as="span"
            id="path-error"
            className="plugin-error plugin-source-missing-error"
          >
            {t('Error: Path is required.')}
          </Form.Text>
        }
      </Form.Group>
    );
  }

  const pluginDocsURL = "https://invest.readthedocs.io/en/latest/plugins.html";
  const pluginRegistryURL = "https://natcap.github.io/invest-plugin-registry/";

  let manualInstallTab = (
    <>
      <div>
        <h5 id="add-plugin-form-title" className="mb-3">{t('Manually Install a Plugin')}</h5>
        <p>
          {t(' For more information about creating a plugin, read our ')}
          <a
            href={pluginDocsURL}
            title={pluginDocsURL}
            aria-label={t("Plugins Developer's Guide (opens in web browser)")}
            onClick={openLinkInBrowser}
          >{t("Developer's Guide")}</a>.
        </p>
      </div>
      <hr />
      <Form aria-labelledby="add-plugin-form-title">
        <Form.Group>
          <Form.Label htmlFor="installFrom">{t('Install from')}</Form.Label>
          <Form.Select
            id="installFrom"
            onChange={(event) => setInstallFrom(event.target.value)}
            className="w-auto"
          >
            <option value="url">{t('git URL')}</option>
            <option value="path">{t('local path')}</option>
          </Form.Select>
        </Form.Group>
        {pluginFields}
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
            id="user-acknowledgment-checkbox"
            label={t('I acknowledge and accept the risks associated with installing this plugin.')}
            value={userAcknowledgment}
            onChange={(event) => setUserAcknowledgment(event.target.checked)}
            aria-describedby={`plugin-installation-risk-statement${userAcknowledgmentError ? ' user-acknowledgment-error' : ''}`}
          />
        </Form.Group>
        {
          userAcknowledgmentError
          &&
          <Form.Text
            as="span"
            id="user-acknowledgment-error"
            className="plugin-error plugin-user-acknowledgment-error"
          >
            {t('Error: Before installing a plugin, you must agree to the terms by selecting the checkbox.')}
          </Form.Text>
        }
        <Button
          disabled={installLoading}
          onClick={handleAddPluginClick}
          aria-describedby="plugin-installation-duration-notice"
        >
          {
            (installLoading == manualInstallID) ? (
              <div className="adding-button">
                <Spinner animation="border" role="status" size="sm" className="plugin-spinner">
                  <span className="visually-hidden">{t('Adding plugin')}</span>
                </Spinner>
                {t(statusMessage)}
              </div>
            ) : t('Add')
          }
        </Button>
        <Form.Text
          as="span"
          muted
          id="plugin-installation-duration-notice"
          className="plugin-form-text"
        >
          {t('This may take several minutes.')}
        </Form.Text>
        <div aria-live="polite">
          { (installSuccess == manualInstallID) &&
            <Form.Text
              as="span"
              className="plugin-success"
            >
              <MdCheckCircleOutline />
              {t('Successfully installed plugin')}
            </Form.Text>
          }
        </div>
      </Form>
    </>
  );
  if (installErr == manualInstallID) {
    manualInstallTab = (
      <>
        <h5>{t('Error installing plugin:')}</h5>
        <div className="plugin-error plugin-install-remove-error">{installErrMsg}</div>
        <Button
          className="me-2"
          onClick={handleResetForm}
        >
          {t('Return to form')}
        </Button>
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
  }
  if (needsMSVC) {
    manualInstallTab = (
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
  }

  let removePluginTab = (
    <>
      <Form aria-labelledby="remove-plugin-form-title">
        <h5 id="remove-plugin-form-title" className="mb-3">{t('Installed Plugins')}</h5>
        <Form.Label htmlFor="selectPluginToRemove">{t('Plugin name')}</Form.Label>
        <Form.Select
          id="selectPluginToRemove"
          value={pluginToRemove}
          onChange={(event) => setPluginToRemove(event.currentTarget.value)}
        >
          {
            Object.keys(plugins).map(
              (pluginID) => (
                <option
                  value={pluginID}
                  key={pluginID}
                >
                  {`${plugins[pluginID].modelTitle} (${plugins[pluginID].version})`}
                </option>
              )
            )
          }
        </Form.Select>
        <Button
          disabled={uninstallLoading || !Object.keys(plugins).length}
          onClick={removePlugin}
        >
          {
            uninstallLoading ? (
              <div className="adding-button">
                <Spinner animation="border" role="status" size="sm" className="plugin-spinner">
                  <span className="visually-hidden">{t('Removing...')}</span>
                </Spinner>
                {t('Removing...')}
              </div>
            ) : t('Remove')
          }
        </Button>
        <div aria-live="polite">
          {removalSuccess &&
            <Form.Text
              as="span"
              className="plugin-success"
            >
              <MdCheckCircleOutline />
              {t('Successfully removed plugin')}
            </Form.Text>
          }
        </div>
      </Form>
    </>
  );
  if (uninstallErr) {
    removePluginTab = (
      <>
        <h5>{t('Error removing plugin:')}</h5>
        <div className="plugin-error plugin-install-remove-error">{uninstallErr}</div>
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
  }

  let advancedSettingsTab = (
    <>
      <Form aria-labelledby="configure-conda-form-title" aria-describedby="conda-executable-description">
        <Form.Group>
          <h5 id="configure-conda-form-title" className="mb-3">{t('Configure conda executable (Advanced)')}</h5>
          <Form.Text
            as="span"
            id="conda-executable-description"
            className="plugin-form-text mb-3"
          >
            {t('InVEST is distributed with a copy of micromamba, a conda-like '
              + 'package manager that is used to manage plugin environments. '
              + 'If you have conda or mamba installed elsewhere on the system, '
              + 'you can configure InVEST to use that executable instead. This '
              + 'may be useful if you run into limitations of the included '
              + 'micromamba distribution. You can enter an absolute path, or '
              + 'the name of an executable that is on the system PATH.')}
          </Form.Text>
          <Form.Label htmlFor="condaPath">{t('Conda or mamba executable')}</Form.Label>
          <div className="d-flex flex-nowrap w-100">
            <Form.Control
              id="condaPath"
              type="text"
              value={condaPath || ''}
              onChange={(event) => setCondaPath(event.target.value)}
              onDragOver={dragOverHandler}
              onDragEnter={dragEnterHandler}
              onDragLeave={dragLeavingHandler}
              onDrop={(event) => {
                const droppedPath = getDroppedFilePath(event);
                if (droppedPath) {
                  setCondaPath(droppedPath);
                }
              }}
              className="me-1"
            />
            <Button
              aria-label="browse for conda executable"
              className="browse-button ms-1 me-1"
              variant="outline-dark"
              onClick={async (event) => setCondaPath(await selectFile(event) || condaPath)}
            >
              <MdFolderOpen />
            </Button>
            <Button
              className="text-nowrap ms-1"
              onClick={resetCondaPath}
            >
              {t('Reset')}
            </Button>
          </div>
          <Button onClick={saveCondaPath} className="text-nowrap mt-3">
            {t('Save')}
          </Button>
        </Form.Group>
      </Form>
      <hr />
      <Form aria-labelledby="configure-plugin-envs-form-title" aria-describedby="plugin-env-description">
        <Form.Group>
        <h5 id="configure-plugin-envs-form-title" className="mb-3">{t('Configure plugin environments (Advanced)')}</h5>
        <Form.Text
            as="span"
            id="plugin-env-description"
            className="plugin-form-text mb-3"
          >
            {t('InVEST creates a separate conda environment for each installed '
              + 'plugin. You may override this and provide a path to a different '
              + 'conda environment, which may be useful for development and '
              + 'debugging.')}
          </Form.Text>
        {Object.keys(plugins).map((pluginID) => (
          <Form.Group key={`${pluginID}-env-group`}>
            <Form.Label htmlFor={pluginID}>
              {pluginID}
            </Form.Label>
            <div
              className="d-flex flex-nowrap w-100 mb-1"
            >
              <Form.Control
                id={pluginID}
                type="text"
                value={pluginEnvs[pluginID]}
                onChange={(event) => setPluginEnvs(
                  {...pluginEnvs, [pluginID]: event.target.value}
                )}
                onDragOver={dragOverHandler}
                onDragEnter={dragEnterHandler}
                onDragLeave={dragLeavingHandler}
                onDrop={(event) => {
                  const droppedPath = getDroppedFilePath(event);
                  if (droppedPath) {
                    setPluginEnvs({
                      ...pluginEnvs,
                      [pluginID]: droppedPath,
                    });
                  }
                }}
                className="me-1"
              />
              <Button
                aria-label="browse for env"
                className="browse-button ms-1 me-2"
                variant="outline-dark"
                onClick={async (event) => setPluginEnvs({
                  ...pluginEnvs,
                  [pluginID]: await selectDirectory(event) || pluginEnvs[pluginID]
                })}
              >
                <MdFolderOpen />
              </Button>
              <Button
                onClick={() => resetPluginEnv(pluginID)}
                className="text-nowrap"
              >
                {t('Reset')}
              </Button>
            </div>
          </Form.Group>
        ))}
        {Object.keys(pluginEnvs).length
          ? <Button
              onClick={savePluginEnvs}
              className="text-nowrap mt-3">
                {t('Save')}
            </Button>
          : <p>{t('No plugins to configure.')}</p>
        }
      </Form.Group>
      </Form>
    </>
  );

  let pluginRegistryTab = (
    <>
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
          <Button
            className="me-2"
            onClick={handleRetryFetchRegistryData}
          >
            {t('Retry')}
          </Button>
        </div>
      ) : (
        <PluginRegistryTab
          registryData={registryData}
          activePluginKey={activePluginKey}
          activePluginIndex={activePluginIndex}
          handlePluginClick={handlePluginClick}
          fetchError={fetchError}
          installedPlugins={plugins}
          addRegistryPlugin={addRegistryPlugin}
          installLoading={installLoading}
          installErr={installErr}
          installErrMsg={installErrMsg}
          installSuccess={installSuccess}
        />
      )}
    </>
  );

  let modalBody = (
    <Modal.Body>
      <Tab.Container id="plugin-modal-tabs" defaultActiveKey="registry">
        <Row>
          <Col sm={2} className="plugin-modal-nav">
            <Nav variant="pills" className="flex-column">
              <Nav.Item className="plugin-modal-nav-item">
                <Nav.Link eventKey="registry">Plugin Registry</Nav.Link>
              </Nav.Item>
              <Nav.Item className="plugin-modal-nav-item">
                <Nav.Link eventKey="installed">Installed Plugins</Nav.Link>
              </Nav.Item>
              <Nav.Item className="plugin-modal-nav-item">
                <Nav.Link eventKey="manual">Manual Install</Nav.Link>
              </Nav.Item>
              <Nav.Item className="plugin-modal-nav-item">
                <Nav.Link eventKey="advanced">Advanced Settings</Nav.Link>
              </Nav.Item>
            </Nav>
          </Col>
          <Col sm={10}>
            <Tab.Content>
              <Tab.Pane eventKey="registry">
                {pluginRegistryTab}
              </Tab.Pane>
              <Tab.Pane eventKey="installed">
                {removePluginTab}
              </Tab.Pane>
              <Tab.Pane eventKey="manual">
                {manualInstallTab}
              </Tab.Pane>
              <Tab.Pane eventKey="advanced">
                {advancedSettingsTab}
              </Tab.Pane>
            </Tab.Content>
          </Col>
        </Row>
      </Tab.Container>
    </Modal.Body>
  );

  return (
    <Modal
      size="xl"
      show={show}
      onHide={handleModalClose}
      contentClassName="plugin-modal"
    >
      <Modal.Header>
        <Modal.Title>{t('Plugin Manager')}</Modal.Title>
        <Button
          variant="secondary-outline"
          onClick={handleModalClose}
          aria-label={t('Close modal')}
        >
          <MdClose />
        </Button>
      </Modal.Header>
      {modalBody}
    </Modal>
  );
}

PluginModal.propTypes = {
  show: PropTypes.bool.isRequired,
  closeModal: PropTypes.func.isRequired,
  openModal: PropTypes.func.isRequired,
  updateInvestList: PropTypes.func.isRequired,
  closeInvestModel: PropTypes.func.isRequired,
  openJobs: PropTypes.shape({
    modelID: PropTypes.string,
  }).isRequired,
};

