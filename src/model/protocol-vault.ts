import assert from 'assert';
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

    private aggregateVaultsBSD: Decimal = new Decimal(0);
    private protocolVaultBalanceBSD: Decimal = new Decimal(0);

    private sum_debt: Decimal = new Decimal(0);

    report: Report;

    // for reporting
    private aggregateDistributionBSD: Decimal = new Decimal(0);

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
            collateral, //not used right now
            protocol_collateral: new Decimal(0), // not used right now
            sum_collateral_t: new Decimal(0) // not used right now
        };

        this.vaults.set(vaultId, vault);

        this.aggregateVaultsBSD = this.aggregateVaultsBSD.plus(debt);

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

    repay(amount: Decimal, vaultId: string) {

        let vault = this.vaults.get(vaultId);
        if (!vault) {
            throw new Error(`Vault does not exist`);
        }

        // attribute any existing protocol debt to the vault and adjust balances
        vault = this.attributeProtocolVaultDebt(vault);

        // update vault native debt balance and sum_t
        this.vaults.set(vaultId, { ...vault, debt: vault.debt.minus(amount), sum_debt_t: this.sum_debt });

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

        // update vault native debt balance and sum_t
        this.vaults.set(vaultId, { ...vault, debt: vault.debt.plus(amount), sum_debt_t: this.sum_debt });

        // increase the aggregate debt totals for native vault debt
        this.aggregateVaultsBSD = this.aggregateVaultsBSD.plus(amount);

    }

    private calculateCurrentProtocolBSD(vault: UserVault): Decimal {
        const rewards = (vault.debt).mul(this.sum_debt.sub(vault.sum_debt_t));
        return rewards;
    }

    calculateCurrentDebt(vaultId: string): { vaultNativeDebt: Decimal, vaultProtocolDebt: Decimal, calculatedVaultProtocolDebt: Decimal, totalVaultDebt: Decimal } {
        let vault = this.vaults.get(vaultId);
        if (!vault) {
            throw new Error(`Vault does not exist`);
        }

        // attribute any existing protocol debt to the vault and adjust balances
        const calculatedVaultProtocolDebt = this.calculateCurrentProtocolBSD(vault);

        return { vaultNativeDebt: vault.debt, vaultProtocolDebt: vault.protocol_debt, calculatedVaultProtocolDebt, totalVaultDebt: vault.debt.plus(calculatedVaultProtocolDebt).plus(vault.protocol_debt) };
    }


    redistribute(bsd: Decimal, sbtc: Decimal) {
        this.sum_debt = this.sum_debt.add(bsd.div(this.aggregateVaultsBSD));
        this.protocolVaultBalanceBSD = this.protocolVaultBalanceBSD.add(bsd);
        this.aggregateDistributionBSD = this.aggregateDistributionBSD.add(bsd);

    }

    reconcileVaultBalances(tag: string) {
        this.vaults.forEach((vault) => {
            const { vaultNativeDebt, vaultProtocolDebt, calculatedVaultProtocolDebt, totalVaultDebt } = this.calculateCurrentDebt(vault.id);
            const collateralRatio = vault.collateral.mul(SBTC_PRICE).div(totalVaultDebt);
            this.report.addReconciliationRow({ state: tag, vaultId: vault.id, vault_debt: vaultNativeDebt, vault_protocol_debt: vaultProtocolDebt, calculatedVaultProtocolDebt, totalVaultDebt, vaultCollateral: vault.collateral, collateralRatio });
        });
    }

    reconcile() {
        let aggregateVaultDebt = new Decimal(0);
        let aggregateProtocolVaultDebt = new Decimal(0);
        this.vaults.forEach((vault) => {
            vault = this.attributeProtocolVaultDebt(vault);
            aggregateVaultDebt = aggregateVaultDebt.plus(vault.debt);
            aggregateProtocolVaultDebt = aggregateProtocolVaultDebt.plus(vault.protocol_debt);
        });
        const aggregateDebt = aggregateVaultDebt.plus(aggregateProtocolVaultDebt);

        // check that total vault debt is equal to the native debt and the attributed protocol debt
        assert(aggregateDebt.minus(this.aggregateVaultsBSD).abs().lessThan(TOLERANCE), `aggregateDebt: ${aggregateDebt}, aggregateVaultsBSD: ${this.aggregateVaultsBSD} `);

        // check that the total redistributed BSD is equal to the sum of the attributed protocol debt and the unattributed protocol debt
        assert(this.aggregateDistributionBSD.minus(this.protocolVaultBalanceBSD.plus(aggregateProtocolVaultDebt)).abs().lessThan(TOLERANCE), `aggregateDistributionBSD: ${this.aggregateDistributionBSD}, protocolVaultBalanceBSD: ${this.protocolVaultBalanceBSD} aggregateProtocolVaultDebt: ${aggregateProtocolVaultDebt}`);

        // check that the aggregate native debt + all distributions is equal the unattributed protocol debt + the aggregate native debt + attributed protocol debt
        assert(aggregateVaultDebt.plus(this.aggregateDistributionBSD).minus(this.protocolVaultBalanceBSD.add(this.aggregateVaultsBSD)).abs().lessThan(TOLERANCE), `aggregateDebt: ${aggregateDebt}, aggregateDistributionBSD: ${this.aggregateDistributionBSD}, protocolVaultBalanceBSD: ${this.protocolVaultBalanceBSD} aggregateVaultsBSD: ${this.aggregateVaultsBSD}`);

        this.vaults.forEach((vault) => {
            this.report.addReconciliationRow({ provider: vault.id, vault_debt: vault.debt, vault_protocol_debt: vault.protocol_debt, protocolVaultBalanceBSD: this.protocolVaultBalanceBSD, aggregateVaultsBSD: this.aggregateVaultsBSD });
        });
    }
}


