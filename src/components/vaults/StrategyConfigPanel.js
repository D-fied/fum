// src/components/vaults/StrategyConfigPanel.js
import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useSelector, useDispatch } from 'react-redux';
import { Card, Form, Button, Alert, Spinner, Badge } from 'react-bootstrap';
import StrategyDetailsSection from './StrategyDetailsSection';
import { updateVaultStrategy, updateVault } from '../../redux/vaultsSlice';
import { triggerUpdate } from '../../redux/updateSlice';
import { useToast } from '@/context/ToastContext';
import StrategyDeactivationModal from './StrategyDeactivationModal';
import StrategyTransactionModal from './StrategyTransactionModal';
import { getVaultContract, executeVaultTransactions } from 'fum_library/blockchain/contracts';
import contractData from 'fum_library/artifacts/contracts';
import { getAvailableStrategies, getStrategyParameters, getTemplateDefaults } from 'fum_library/helpers/strategyHelpers';
import { getExecutorAddress } from 'fum_library/helpers/chainHelpers';
import { config } from 'dotenv';

const StrategyConfigPanel = ({
  vaultAddress,
  isOwner,
  performance,
  onStrategyToggle
}) => {
  const dispatch = useDispatch();
  const provider = useSelector(state => state.wallet.provider);
  const chainId = useSelector(state => state.wallet.chainId);
  const availableStrategies = useSelector(state => state.strategies.availableStrategies);

  // Get the vault from Redux
  const vault = useSelector((state) =>
    state.vaults.userVaults.find(v => v.address === vaultAddress)
  );

  // State
  const [selectedStrategy, setSelectedStrategy] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activePreset, setActivePreset] = useState('custom');
  const [strategyParams, setStrategyParams] = useState({});
  // Store complete set of parameters including template defaults
  const [initialParams, setInitialParams] = useState({});
  const [selectedTokens, setSelectedTokens] = useState([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState([]);
  const [editMode, setEditMode] = useState(false);
  const [validateFn, setValidateFn] = useState(null);

  // Modals state
  const [showDeactivationModal, setShowDeactivationModal] = useState(false);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [transactionSteps, setTransactionSteps] = useState([]);
  const [currentTransactionStep, setCurrentTransactionStep] = useState(0);
  const [transactionError, setTransactionError] = useState('');
  const [transactionLoading, setTransactionLoading] = useState(false);

  // Change tracking
  const [initialSelectedStrategy, setInitialSelectedStrategy] = useState('');
  const [initialActivePreset, setInitialActivePreset] = useState('custom');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [templateChanged, setTemplateChanged] = useState(false);
  const [tokensChanged, setTokensChanged] = useState(false);
  const [platformsChanged, setPlatformsChanged] = useState(false);
  const [paramsChanged, setParamsChanged] = useState(false);

  // NEW: Add data loading state
  const [isDataLoaded, setIsDataLoaded] = useState(false);

  const { showSuccess, showError } = useToast();

  // Load available strategies and set initial state on component mount
  useEffect(() => {
    // Reset change tracking flags during loading
    setTemplateChanged(false);
    setTokensChanged(false);
    setPlatformsChanged(false);
    setParamsChanged(false);
    setHasUnsavedChanges(false);

    // If vault has an active strategy, set it as selected
    if (vault?.strategy?.strategyId) {
      // Get strategy from vault
      const activeStrategy = vault.strategy.strategyId;
      setSelectedStrategy(activeStrategy);
      setInitialSelectedStrategy(activeStrategy);

      // Store parameters and preset
      if (vault.strategy.parameters) {
        setStrategyParams(vault.strategy.parameters);
        setInitialParams(vault.strategy.parameters);
      }

      // Set preset
      if (vault.strategy.activeTemplate) {
        setActivePreset(vault.strategy.activeTemplate);
        setInitialActivePreset(vault.strategy.activeTemplate);
      }

      // Set selected tokens and platforms
      if (vault.strategy.selectedTokens) {
        setSelectedTokens(vault.strategy.selectedTokens);
      }

      if (vault.strategy.selectedPlatforms) {
        setSelectedPlatforms(vault.strategy.selectedPlatforms);
      }
    } else if (vault?.hasActiveStrategy) {
      // Fallback to 'fed' if we know there's a strategy but don't have details
      setSelectedStrategy('fed');
      setInitialSelectedStrategy('fed');
    } else {
      setSelectedStrategy('');
      setInitialSelectedStrategy('');
    }

    // Determine if data is fully loaded
    const isComplete = vault && (
      !vault.hasActiveStrategy ||
      (vault.strategy?.strategyId && vault.strategy?.parameters)
    );

    if (isComplete) {
      setIsDataLoaded(true)
    } else {
      setIsDataLoaded(false);
    }
  }, [vault]);

  // Check for unsaved changes whenever relevant state changes
  useEffect(() => {
    // Only detect changes after data is fully loaded
    if (!isDataLoaded) return;

    const hasChanges =
      // Strategy selection changes
      (selectedStrategy !== initialSelectedStrategy) ||
      (activePreset !== initialActivePreset) ||
      templateChanged || tokensChanged || platformsChanged || paramsChanged;

    setHasUnsavedChanges(hasChanges);
  }, [
    isDataLoaded, // Add this to prevent premature detection
    selectedStrategy,
    initialSelectedStrategy, // Add initial values to dependencies
    activePreset,
    initialActivePreset,
    templateChanged,
    tokensChanged,
    platformsChanged,
    paramsChanged
  ]);

  // Handle strategy selection change
  const handleStrategyChange = (e) => {
    if (!isDataLoaded) return; // Prevent changes during loading
    setSelectedStrategy(e.target.value);
    setEditMode(true);
  };

  // Handle confirmation of strategy deactivation
  const handleConfirmDeactivation = async () => {
    setShowDeactivationModal(false);

    try {
      // Set loading state
      setIsLoading(true);

      if (!provider) {
        throw new Error("No provider available");
      }

      // Get signer
      const signer = await provider.getSigner();

      // Get vault contract instance
      const vaultContract = getVaultContract(vaultAddress, provider, signer);

      // Send transaction to remove strategy
      const tx = await vaultContract.removeStrategy();

      // Wait for transaction to be mined
      await tx.wait();

      // Clear strategy state
      setSelectedStrategy('');
      setEditMode(false);

      // Update vault data in Redux
      dispatch(updateVault({
        vaultAddress,
        vaultData: {
          hasActiveStrategy: false,
          strategyAddress: null
        }
      }));

      // Update strategy state in Redux
      dispatch(updateVaultStrategy({
        vaultAddress,
        strategy: {
          isActive: false,
          lastUpdated: Date.now()
        }
      }));

      // Trigger data refresh
      dispatch(triggerUpdate());

      // Show success message
      showSuccess("Strategy deactivated successfully");
    } catch (error) {
      console.error("Error deactivating strategy:", error);
      showError(`Failed to deactivate strategy: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle edit request from child component
  const handleEditRequest = () => {
    if (!isDataLoaded) return; // Prevent changes during loading
    setEditMode(true);
  };

  // Check if parameters have changed compared to initial values - uses deep comparison
  const checkParametersChanged = (newParams, originalParams) => {
    if (!originalParams) {
      return Object.keys(newParams).length > 0;
    }

    const keys = new Set([...Object.keys(newParams), ...Object.keys(originalParams)]);

    for (const key of keys) {
      const newValue = newParams[key];
      const originalValue = originalParams[key];

      if (newValue === undefined || originalValue === undefined) {
        if (newValue !== originalValue) {
          return true;
        }
      } else if (typeof newValue === 'object' && typeof originalValue === 'object') {
        if (JSON.stringify(newValue) !== JSON.stringify(originalValue)) {
          return true;
        }
      } else if (newValue !== originalValue) {
        return true;
      }
    }

    return false;
  };

  // Helper to compare arrays regardless of order
  const areArraysEqual = (arr1, arr2) => {
    if (!arr1 || !arr2) return false;
    if (arr1.length !== arr2.length) return false;

    // Create sorted copies for comparison
    const sorted1 = [...arr1].sort();
    const sorted2 = [...arr2].sort();

    return sorted1.every((val, idx) => val === sorted2[idx]);
  };

  // Handle parameter changes
  const handleParamsChange = (paramData) => {
    if (!isDataLoaded) return; // Prevent changes during loading

    // Handle preset change
    if (paramData.activePreset !== activePreset) {
      setTemplateChanged(paramData.activePreset !== initialActivePreset);
      const newPreset = paramData.activePreset;
      setActivePreset(newPreset);

      // If switching to a preset (not custom), load template parameters
      if (newPreset !== 'custom') {
        const templateDefaults = getTemplateDefaults(selectedStrategy, newPreset);
        if (templateDefaults) {
          setStrategyParams(templateDefaults);
          // We don't update initialParams here - that would erase change detection
          // Check if the new template params differ from initial params
          setParamsChanged(checkParametersChanged(templateDefaults, initialParams));
        }
      }
    }

    // Handle parameter changes with deep comparison
    if (paramData.parameters) {
      const newParams = { ...strategyParams, ...paramData.parameters };
      setStrategyParams(newParams);

      // Check if parameters have changed using deep comparison
      setParamsChanged(checkParametersChanged(newParams, initialParams));
    }

    // Handle token selection with proper array comparison
    if (paramData.selectedTokens) {
      setSelectedTokens(paramData.selectedTokens);
      // Check if tokens have changed using array comparison
      setTokensChanged(!areArraysEqual(paramData.selectedTokens, currentStrategy?.selectedTokens || []));
    }

    // Handle platform selection with proper array comparison
    if (paramData.selectedPlatforms) {
      setSelectedPlatforms(paramData.selectedPlatforms);
      // Check if platforms have changed using array comparison
      setPlatformsChanged(!areArraysEqual(paramData.selectedPlatforms, currentStrategy?.selectedPlatforms || []));
    }
  };

  // Set validation function
  const handleSetValidation = (validateFn) => {
    // Only update if it's actually different to avoid re-renders
    if (validateFn !== validateFn) {
      setValidateFn(() => validateFn);
    }
  };

  // Get the strategy name for display
  const getStrategyName = () => {
    const strategy = availableStrategies.find(s => s.id === selectedStrategy);
    return strategy?.name || "Strategy";
  };

  // Generate transaction steps based on what needs to be done
  const generateTransactionSteps = () => {
    const steps = [];
    const strategyConfig = availableStrategies.find(s => s.id === selectedStrategy);
    const strategyName = strategyConfig?.name || "Strategy";

    // Step 1: Set strategy if activating or changing
    if (!vault.strategyAddress || initialSelectedStrategy !== selectedStrategy) {
      steps.push({
        title: `Set Strategy Contract`,
        description: `Authorize the ${strategyName} strategy for this vault`,
      });
    }

    // Step 2: Set target tokens if provided
    if (selectedTokens.length > 0 && tokensChanged) {
      steps.push({
        title: `Set Target Tokens`,
        description: `Configure which tokens the strategy will manage`,
      });
    }

    // Step 3: Set target platforms if provided
    if (selectedPlatforms.length > 0 && platformsChanged) {
      steps.push({
        title: `Set Target Platforms`,
        description: `Configure which platforms the strategy will use`,
      });
    }

    // Step 4: Select template if applicable
    if (activePreset && templateChanged) {
      steps.push({
        title: `Select Strategy Template`,
        description: `Apply the ${activePreset} template to set initial parameters`,
      });
    }

    // Step 5: Set parameters if changed
    if ((activePreset === 'custom' || paramsChanged) && Object.keys(strategyParams).length > 0) {
      steps.push({
        title: `Set Strategy Parameters`,
        description: `Configure the detailed behavior of the strategy`,
      });
    }

    return steps;
  };

  // Handle save button click
  const handleSave = async () => {
    // Validation
    if (typeof validateFn === 'function') {
      const isValid = validateFn();
      if (!isValid) return;
    }

    // Generate transaction steps
    const steps = generateTransactionSteps();
    setTransactionSteps(steps);
    setCurrentTransactionStep(0);
    setTransactionError('');
    setShowTransactionModal(true);

    try {
      setTransactionLoading(true);

      if (!provider) {
        throw new Error("No provider available");
      }

      // Get signer with await
      const signer = await provider.getSigner();

      // Get the selected strategy details from the config
      const strategyConfig = getAvailableStrategies().find(s => s.id === selectedStrategy);
      if (!strategyConfig) {
        throw new Error(`Strategy configuration not found for ${selectedStrategy}`);
      }

      // Get the contract address for the selected strategy
      let strategyAddress;
      Object.keys(contractData).forEach(contractKey => {
        // Skip non-strategy contracts
        if (['VaultFactory', 'PositionVault', 'BatchExecutor', 'ParrisIslandStrategy'].includes(contractKey)) {
          return;
        }

        const addresses = contractData[contractKey].addresses || {};
        if (addresses[chainId]) {
          strategyAddress = addresses[chainId];
        }
      });

      if (!strategyAddress) {
        throw new Error(`Strategy ${selectedStrategy} not deployed on this network (Chain ID: ${chainId})`);
      }

      // Get PositionVault contract instance
      const vaultContract = getVaultContract(vaultAddress, provider, signer);

      // Get strategy contract interface from config
      const strategyContract = new ethers.Contract(
        strategyAddress,
        contractData[selectedStrategy].abi,
        signer
      );

      // Check if the vault is authorized in the strategy contract
      let isAuthorized = false;
      try {
        isAuthorized = await strategyContract.authorizedVaults(vaultAddress);
      } catch (authCheckError) {
        console.warn("Strategy doesn't support vault authorization check:", authCheckError.message);
      }

      if (!isAuthorized) {
        try {
          // If not authorized, try to authorize it
          const authTx = await strategyContract.authorizeVault(vaultAddress);
          await authTx.wait();
        } catch (authError) {
          console.warn("Strategy doesn't support vault authorization or failed:", authError.message);
        }
      }

      // PART 1: Direct calls to PositionVault contract

      // Step 1: Set strategy if needed
      if (!vault.strategyAddress || !vault.hasActiveStrategy) {
        setCurrentTransactionStep(0);
        const setStrategyTx = await vaultContract.setStrategy(strategyAddress);
        await setStrategyTx.wait();
        setCurrentTransactionStep(1);
      }

      // Step 2: Set target tokens if needed
      if (selectedStrategy && selectedTokens.length > 0 && tokensChanged) {
        // Find the correct step index
        const stepIndex = steps.findIndex(step => step.title.includes('Target Tokens'));
        if (stepIndex >= 0) setCurrentTransactionStep(stepIndex);

        // Create a NEW array for tokens to avoid immutability issues
        const setTokensTx = await vaultContract.setTargetTokens([...selectedTokens]);
        await setTokensTx.wait();
        setCurrentTransactionStep(stepIndex + 1);
      }

      // Step 3: Set target platforms if needed
      if (selectedStrategy && selectedPlatforms.length > 0 && platformsChanged) {
        // Find the correct step index
        const stepIndex = steps.findIndex(step => step.title.includes('Target Platforms'));
        if (stepIndex >= 0) setCurrentTransactionStep(stepIndex);

        // Create a NEW array for platforms to avoid immutability issues
        const setPlatformsTx = await vaultContract.setTargetPlatforms([...selectedPlatforms]);
        await setPlatformsTx.wait();
        setCurrentTransactionStep(stepIndex + 1);
      }

      // PART 2: Batch calls to Strategy contract through vault's execute function

      // Array to hold strategy transactions
      const strategyTransactions = [];

      // Get strategy-specific configuration for formatting parameters
      const parameterDefinitions = getStrategyParameters(selectedStrategy);

      // Step 4: Handle template selection if the strategy supports templates
      if (selectedStrategy && activePreset && templateChanged) {
        // Find the correct step index
        const stepIndex = steps.findIndex(step => step.title.includes('Template'));
        if (stepIndex >= 0) setCurrentTransactionStep(stepIndex);

        // Get the template enum mapping from the config if available
        const templateEnumMap = strategyConfig.templateEnumMap;
        let templateValue = 0; // Default to 0 for 'custom'

        if (activePreset !== 'custom') {
          templateValue = templateEnumMap ? templateEnumMap[activePreset] || 0 : 0;
        }

        strategyTransactions.push({
          target: strategyAddress,
          data: strategyContract.interface.encodeFunctionData("selectTemplate", [
            templateValue
          ]),
          description: `Select template: ${activePreset} (value: ${templateValue})`
        });
      }

      // Step 5: Set strategy parameters based on the strategy's parameter groups
      if (selectedStrategy && (activePreset === 'custom' || paramsChanged)) {
        // Get contract parameter groups from config
        const contractParamGroups = strategyConfig.contractParametersGroups || [];

        // Process each contract parameter group
        for (const group of contractParamGroups) {
          // Get parameters for this contract group
          const groupParamIds = group.parameters || [];
          const availableParams = groupParamIds.filter(paramId => strategyParams[paramId] !== undefined);

          // Skip if no parameters in this group or not all required parameters are available
          if (availableParams.length === 0 || availableParams.length !== groupParamIds.length) continue;

          // Format parameters according to their types
          const formattedParams = groupParamIds.map(paramId => {
            const value = strategyParams[paramId];
            const config = parameterDefinitions[paramId];

            // Format based on parameter type
            switch (config.type) {
              case 'percent':
                // Convert percentage to basis points (multiply by 100)
                return Math.round(parseFloat(value) * 100);

              case 'fiat-currency':
                // Convert to pennies
                return parseFloat(value).toFixed(2) * 100;

              case 'boolean':
                return !!value;

              case 'select':
                // Use the raw value for select types (should be enum value)
                return parseInt(value);

              default:
                // For other types, use the value as is
                return value;
            }
          });

          // Create transaction for this parameter group
          strategyTransactions.push({
            target: strategyAddress,
            data: strategyContract.interface.encodeFunctionData(group.setterMethod, formattedParams),
            description: `Set ${group.id} parameters`
          });
        }
      }

      // Execute strategy transactions if any
      if (strategyTransactions.length > 0) {
        // Extract targets and data for executeVaultTransactions
        const targets = strategyTransactions.map(tx => tx.target);
        const dataArray = strategyTransactions.map(tx => tx.data);

        try {
          // Execute the batch through vault's execute function
          const result = await vaultContract.execute(targets, dataArray);
          await result.wait();

          // Set step to completed
          setCurrentTransactionStep(steps.length);
        } catch (error) {
          console.error("Failed to execute strategy transactions:", error);
          setTransactionError(`Failed to update strategy parameters: ${error.message}`);
          throw error;
        }
      } else {
        // If no strategy transactions, mark as complete
        setCurrentTransactionStep(steps.length);
      }

      // Update Redux with new strategy state - including proper vault fields
      dispatch(updateVaultStrategy({
        vaultAddress,
        strategy: {
          strategyId: selectedStrategy,
          strategyAddress,
          parameters: strategyParams,
          selectedTokens,
          selectedPlatforms,
          isActive: true,
          activeTemplate: activePreset,
          lastUpdated: Date.now()
        }
      }));

      // Update the top-level vault fields too - THIS IS CRITICAL FOR DISPLAY UPDATES
      dispatch(updateVault({
        vaultAddress,
        vaultData: {
          hasActiveStrategy: true,
          strategyAddress: strategyAddress
        }
      }));

      // Trigger a data refresh
      dispatch(triggerUpdate());

      // Show success message
      showSuccess("Strategy configuration saved successfully");

      // Update component state
      setInitialSelectedStrategy(selectedStrategy);
      setInitialActivePreset(activePreset);
      setInitialParams(strategyParams);
      setTemplateChanged(false);
      setTokensChanged(false);
      setPlatformsChanged(false);
      setParamsChanged(false);
      setHasUnsavedChanges(false);
      setEditMode(false);
      setShowTransactionModal(false);
      setTransactionLoading(false);
    } catch (error) {
      console.error("Error saving strategy configuration:", error);
      setTransactionError(`Failed to save strategy: ${error.message}`);
      showError(`Failed to save strategy: ${error.message}`);
      setTransactionLoading(false);
    }
  };

  // Handle cancel button click
  const handleCancel = () => {
    // If we were just setting up a new strategy, revert to original
    if (selectedStrategy !== initialSelectedStrategy) {
      setSelectedStrategy(initialSelectedStrategy);
    }

    if (activePreset !== initialActivePreset) {
      setActivePreset(initialActivePreset);
    }

    // Reset parameters to initial state
    setStrategyParams(initialParams);
    setTemplateChanged(false);
    setTokensChanged(false);
    setPlatformsChanged(false);
    setParamsChanged(false);

    console.log('setting hasUnsavedChanges & editMode to false...')
    setHasUnsavedChanges(false);
    setEditMode(false);
  };

  // Close transaction modal
  const handleCloseTransactionModal = () => {
    setShowTransactionModal(false);
  };

  // Access current strategy directly from vault for array comparisons
  const currentStrategy = vault?.strategy || null;

  // Render the strategy config panel
  return (
    <Card>
      <Card.Body>
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h4 className="mb-0">Strategy Configuration</h4>
        </div>

        <p>Configure automated management strategies for this vault's positions and tokens.</p>

        {!isDataLoaded && (
          <Alert variant="info">
            Loading strategy configuration...
          </Alert>
        )}

        <div className="mb-4">
          <Form.Group>
            {vault?.hasActiveStrategy && isOwner && !editMode ? (
              <Form.Label style={{ width: '100%' }} >
                <Button
                  variant="outline-danger"
                  size="sm"
                  onClick={() => setShowDeactivationModal(true)}
                  style={{ width: '100%' }}
                >
                  Disable Strategy
                </Button>
              </Form.Label>
            ) : (
              <Form.Label><strong>Select Strategy</strong></Form.Label>
            )}
            <Form.Select
              value={selectedStrategy}
              onChange={handleStrategyChange}
              disabled={!isOwner || !isDataLoaded || (vault?.hasActiveStrategy && !hasUnsavedChanges)}
              className="mb-3"
            >
              <option value="">Select a strategy</option>
              {availableStrategies.map(strategy => (
                <option key={strategy.id} value={strategy.id} disabled={strategy.comingSoon}>
                  {strategy.name} - {strategy.subtitle} {strategy.comingSoon ? "(Coming Soon)" : ""}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
        </div>

        <h5 className="mt-4">Strategy Details</h5>
        <div className="strategy-details p-3 border rounded bg-light">
          {!selectedStrategy ? (
            <Alert variant="info">
              No strategy selected for the vault. Select a strategy to configure automated management.
            </Alert>
          ) : (
            <StrategyDetailsSection
              vaultAddress={vaultAddress}
              isOwner={isOwner}
              strategyId={selectedStrategy}
              strategyActive={vault?.hasActiveStrategy && !hasUnsavedChanges}
              editMode={editMode}
              onEditRequest={handleEditRequest}
              onCancel={handleCancel}
              onValidate={handleSetValidation}
              onParamsChange={handleParamsChange}
              isDataLoaded={isDataLoaded} // Pass loading state to child
            />
          )}
        </div>

        {/* Save/Cancel buttons at the bottom */}
        {isOwner && isDataLoaded && (editMode || hasUnsavedChanges) && (
          <div className="d-flex justify-content-end mt-4">
            <Button
              variant="outline-secondary"
              onClick={handleCancel}
              className="me-2"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSave}
            >
              Save Configuration
            </Button>
          </div>
        )}
      </Card.Body>

      {/* Strategy Deactivation Modal */}
      <StrategyDeactivationModal
        show={showDeactivationModal}
        onHide={() => setShowDeactivationModal(false)}
        onConfirm={handleConfirmDeactivation}
        strategyName={getStrategyName()}
      />

      {/* Strategy Transaction Modal */}
      <StrategyTransactionModal
        show={showTransactionModal}
        onHide={handleCloseTransactionModal}
        onCancel={() => {
          if (!transactionLoading) {
            setShowTransactionModal(false);
          }
        }}
        currentStep={currentTransactionStep}
        steps={transactionSteps}
        isLoading={transactionLoading}
        error={transactionError}
        tokenSymbols={selectedTokens}
        strategyName={getStrategyName()}
      />
    </Card>
  );
};

export default StrategyConfigPanel;
