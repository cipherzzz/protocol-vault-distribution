import { Decimal } from 'decimal.js';
import { SBTC_PRICE } from '../util/constants';
import { Report } from '../util/report';

const TOLERANCE = new Decimal(1e-8);

export interface UserVault {
    id: string;
    debt: Decimal;
    protocol_debt: Decimal;
    sum_debt_t: Decimal;
    collateral: Decimal;
    protocol_collateral: Decimal;
    sum_collateral_t: Decimal;
}

export class ProtocolVault {
    private vaults: Map<string, UserVault> = new Map();

    // bsd distribution
    private aggregateVaultsBSD: Decimal = new Decimal(0);
    private protocolVaultBalanceBSD: Decimal = new Decimal(0);
    private sum_debt: Decimal = new Decimal(0);

    // sbtc distribution
    private aggregateVaultsSBTC: Decimal = new Decimal(0);
    private protocolVaultBalanceSBTC: Decimal = new Decimal(0);
    private sum_collateral: Decimal = new Decimal(0);

    report: Report;

    // for reporting
    private aggregateDistributionBSD: Decimal = new Decimal(0);
    private aggregateDistributionSBTC: Decimal = new Decimal(0);

    constructor(report: Report) {
        this.report = report;
    }

    createVault(vaultId: string, debt: Decimal, collateral: Decimal) {

        if (this.vaults.has(vaultId)) {
            throw new Error(`Vault already exists`);
        }

        const vault: UserVault = {
            id: vaultId,
            debt,
            protocol_debt: new Decimal(0),
            sum_debt_t: this.sum_debt,
            collateral,
            protocol_collateral: new Decimal(0),
            sum_collateral_t: this.sum_collateral
        };

        this.vaults.set(vaultId, vault);

        this.aggregateVaultsBSD = this.aggregateVaultsBSD.plus(debt);
        this.aggregateVaultsSBTC = this.aggregateVaultsSBTC.plus(collateral)

        this.report.addAction(`Added vault: ${vaultId}`);
    }

    attributeProtocolVaultDebt(vault: UserVault) {

        // See if there is any existing protocol debt that belongs to this vault that has not already been attributed to it
        const existingProtocolBSD = this.calculateCurrentProtocolBSD(vault);

        // If there is any existing protocol debt that has not been attributed to this vault, then we need to subtract it from the protocol vault balance
        this.protocolVaultBalanceBSD = this.protocolVaultBalanceBSD.minus(existingProtocolBSD);

        // add the new protocol debt to the aggregate vault bsd totals
        this.aggregateVaultsBSD = this.aggregateVaultsBSD.plus(existingProtocolBSD);

        // compound the attributed protocol debt to the vault
        vault.protocol_debt = vault.protocol_debt.plus(existingProtocolBSD);

        return vault;
    }

    attributeProtocolVaultCollateral(vault: UserVault) {
        // See if there is any existing protocol collateral that belongs to this vault that has not already been attributed to it
        const existingProtocolSBTC = this.calculateCurrentProtocolSBTC(vault);

        // If there is any existing protocol collateral that has not been attributed to this vault, then we need to subtract it from the protocol vault balance
        this.protocolVaultBalanceSBTC = this.protocolVaultBalanceSBTC.minus(existingProtocolSBTC);

        // add the new protocol collateral to the aggregate vault sbtc totals
        this.aggregateVaultsSBTC = this.aggregateVaultsSBTC.plus(existingProtocolSBTC);

        console.log(`vault_protocol_collateral: ${vault.protocol_collateral}, existingProtocolSBTC: ${existingProtocolSBTC}`);

        // compound the attributed protocol debt to the vault
        vault.protocol_collateral = vault.protocol_collateral.plus(existingProtocolSBTC);

        return vault;
    }

    repay(amount: Decimal, vaultId: string) {

        let vault = this.vaults.get(vaultId);
        if (!vault) {
            throw new Error(`Vault does not exist`);
        }

        // attribute any existing protocol debt to the vault and adjust balances
        vault = this.attributeProtocolVaultDebt(vault);
        vault = this.attributeProtocolVaultCollateral(vault);

        // update vault native debt balance and sum_t
        this.vaults.set(vaultId, { ...vault, debt: vault.debt.minus(amount), sum_debt_t: this.sum_debt, sum_collateral_t: this.sum_collateral });

        // reduce the aggregate debt totals for native vault debt
        this.aggregateVaultsBSD = this.aggregateVaultsBSD.minus(amount);

    }

    borrow(amount: Decimal, vaultId: string) {

        let vault = this.vaults.get(vaultId);
        if (!vault) {
            throw new Error(`Vault does not exist`);
        }

        // attribute any existing protocol debt to the vault and adjust balances
        vault = this.attributeProtocolVaultDebt(vault);
        vault = this.attributeProtocolVaultCollateral(vault);

        // update vault native debt balance and sum_t
        this.vaults.set(vaultId, { ...vault, debt: vault.debt.plus(amount), sum_debt_t: this.sum_debt, sum_collateral_t: this.sum_collateral });

        // increase the aggregate debt totals for native vault debt
        this.aggregateVaultsBSD = this.aggregateVaultsBSD.plus(amount);

    }

    deposit(amount: Decimal, vaultId: string) {

        let vault = this.vaults.get(vaultId);
        if (!vault) {
            throw new Error(`Vault does not exist`);
        }

        // attribute any existing protocol debt to the vault and adjust balances
        vault = this.attributeProtocolVaultDebt(vault);
        vault = this.attributeProtocolVaultCollateral(vault);

        // update vault native collateral balance and sum_t
        this.vaults.set(vaultId, { ...vault, collateral: vault.collateral.plus(amount), sum_debt_t: this.sum_debt, sum_collateral_t: this.sum_collateral });

        // increase the aggregate collateral totals for native vault collateral
        this.aggregateVaultsSBTC = this.aggregateVaultsSBTC.plus(amount);

    }


    withdraw(amount: Decimal, vaultId: string) {

        let vault = this.vaults.get(vaultId);
        if (!vault) {
            throw new Error(`Vault does not exist`);
        }

        // attribute any existing protocol debt to the vault and adjust balances
        vault = this.attributeProtocolVaultDebt(vault);
        vault = this.attributeProtocolVaultCollateral(vault);

        // update vault native collateral balance and sum_t
        this.vaults.set(vaultId, { ...vault, collateral: vault.collateral.minus(amount), sum_debt_t: this.sum_debt, sum_collateral_t: this.sum_collateral });

        // reduce the aggregate collateral totals for native vault collateral
        this.aggregateVaultsSBTC = this.aggregateVaultsSBTC.minus(amount);
    }


    private calculateCurrentProtocolBSD(vault: UserVault): Decimal {
        const rewards = (vault.debt.plus(vault.protocol_debt)).mul(this.sum_debt.sub(vault.sum_debt_t));
        return rewards;
    }

    private calculateCurrentProtocolSBTC(vault: UserVault): Decimal {
        const rewards = (vault.collateral.plus(vault.protocol_collateral)).mul(this.sum_collateral.sub(vault.sum_collateral_t));
        return rewards;
    }

    calculateCurrentBalances(vaultId: string): { vaultNativeDebt: Decimal, vaultNativeCollateral: Decimal, vaultProtocolCollateral: Decimal, vaultProtocolDebt: Decimal, calculatedVaultProtocolCollateral: Decimal, calculatedVaultProtocolDebt: Decimal, totalVaultCollateral: Decimal, totalVaultDebt: Decimal } {
        let vault = this.vaults.get(vaultId);
        if (!vault) {
            throw new Error(`Vault does not exist`);
        }

        const calculatedVaultProtocolCollateral = this.calculateCurrentProtocolSBTC(vault);
        const calculatedVaultProtocolDebt = this.calculateCurrentProtocolBSD(vault);

        return { vaultNativeCollateral: vault.collateral, vaultNativeDebt: vault.debt, vaultProtocolCollateral: vault.protocol_collateral, vaultProtocolDebt: vault.protocol_debt, calculatedVaultProtocolCollateral, calculatedVaultProtocolDebt, totalVaultCollateral: vault.collateral.plus(calculatedVaultProtocolCollateral).plus(vault.protocol_collateral), totalVaultDebt: vault.debt.plus(calculatedVaultProtocolDebt).plus(vault.protocol_debt) };
    }

    redistribute(bsd: Decimal, sbtc: Decimal) {

        // debt
        this.sum_debt = this.sum_debt.add(bsd.div(this.aggregateVaultsBSD));
        this.protocolVaultBalanceBSD = this.protocolVaultBalanceBSD.add(bsd);
        this.aggregateDistributionBSD = this.aggregateDistributionBSD.add(bsd);

        // collateral
        this.sum_collateral = this.sum_collateral.add(sbtc.div(this.aggregateVaultsSBTC));
        this.protocolVaultBalanceSBTC = this.protocolVaultBalanceSBTC.add(sbtc);
        this.aggregateDistributionBSD = this.aggregateDistributionSBTC.add(sbtc);

    }

    reconcileAmounts(tag: string) {
        this.vaults.forEach((vault) => {
            const { vaultNativeCollateral, vaultNativeDebt, vaultProtocolCollateral, calculatedVaultProtocolCollateral, calculatedVaultProtocolDebt, totalVaultCollateral, totalVaultDebt, vaultProtocolDebt } = this.calculateCurrentBalances(vault.id);
            const collateralRatio = totalVaultCollateral.mul(SBTC_PRICE).div(totalVaultDebt);
            this.report.addReconciliationRow({ state: tag, vaultId: vault.id, vault_debt: vaultNativeDebt, vault_collateral: vaultNativeCollateral, vault_protocol_debt: vaultProtocolDebt, vault_protocol_collateral: vaultProtocolCollateral, calculatedVaultProtocolCollateral, calculatedVaultProtocolDebt, totalVaultCollateral, collateralRatio });
        });
    }

    reconcile(tag: string) {
        this.reconcileAmounts(tag);
    }

    // reconcile() {
    //     let aggregateVaultDebt = new Decimal(0);
    //     let aggregateProtocolVaultDebt = new Decimal(0);
    //     this.vaults.forEach((vault) => {
    //         vault = this.attributeProtocolVaultDebt(vault);
    //         aggregateVaultDebt = aggregateVaultDebt.plus(vault.debt);
    //         aggregateProtocolVaultDebt = aggregateProtocolVaultDebt.plus(vault.protocol_debt);
    //     });
    //     const aggregateDebt = aggregateVaultDebt.plus(aggregateProtocolVaultDebt);

    //     // check that total vault debt is equal to the native debt and the attributed protocol debt
    //     assert(aggregateDebt.minus(this.aggregateVaultsBSD).abs().lessThan(TOLERANCE), `aggregateDebt: ${aggregateDebt}, aggregateVaultsBSD: ${this.aggregateVaultsBSD} `);

    //     // check that the total redistributed BSD is equal to the sum of the attributed protocol debt and the unattributed protocol debt
    //     assert(this.aggregateDistributionBSD.minus(this.protocolVaultBalanceBSD.plus(aggregateProtocolVaultDebt)).abs().lessThan(TOLERANCE), `aggregateDistributionBSD: ${this.aggregateDistributionBSD}, protocolVaultBalanceBSD: ${this.protocolVaultBalanceBSD} aggregateProtocolVaultDebt: ${aggregateProtocolVaultDebt}`);

    //     // check that the aggregate native debt + all distributions is equal the unattributed protocol debt + the aggregate native debt + attributed protocol debt
    //     assert(aggregateVaultDebt.plus(this.aggregateDistributionBSD).minus(this.protocolVaultBalanceBSD.add(this.aggregateVaultsBSD)).abs().lessThan(TOLERANCE), `aggregateDebt: ${aggregateDebt}, aggregateDistributionBSD: ${this.aggregateDistributionBSD}, protocolVaultBalanceBSD: ${this.protocolVaultBalanceBSD} aggregateVaultsBSD: ${this.aggregateVaultsBSD}`);

    //     this.vaults.forEach((vault) => {
    //         this.report.addReconciliationRow({ provider: vault.id, vault_debt: vault.debt, vault_protocol_debt: vault.protocol_debt, protocolVaultBalanceBSD: this.protocolVaultBalanceBSD, aggregateVaultsBSD: this.aggregateVaultsBSD });
    //     });
    // }
}


