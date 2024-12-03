import { assert } from 'console';
import { Decimal } from 'decimal.js';
import { Report } from '../util/report';

const TOLERANCE = new Decimal(1e-8);

// TypeScript interface for Provider
export interface Provider {
    id: string;
    deposited: Decimal;
    sum_t: Decimal;
    product_t: Decimal;
}

export class StabilityPool {
    private providers: Map<string, Provider> = new Map();
    private poolBalanceBSD: Decimal = new Decimal(0);
    private poolBalanceSBTC: Decimal = new Decimal(0);
    private sum: Decimal = new Decimal(0);
    private product: Decimal = new Decimal(1);
    report: Report;

    constructor(report: Report) {
        this.report = report;
    }

    // Method to add provider to the pool
    addProvider(stabilityProvider: string) {

        if (this.providers.has(stabilityProvider)) {
            console.log(`Provider already exists`);
            return;
        }

        const provider: Provider = {
            id: stabilityProvider,
            deposited: new Decimal(0),
            sum_t: this.sum,
            product_t: this.product,
        };

        this.providers.set(stabilityProvider, provider);
        this.report.addAction(`Added provider: ${stabilityProvider}`);
    }

    // Method to add deposit to the pool
    depositStability(amount: Decimal, stabilityProvider: string) {

        const provider = this.providers.get(stabilityProvider);
        if (!provider) {
            console.log(`Provider does not exist`);
            return;
        }

        // pay out existing rewards
        const existingRewards = this.calculateCurrentRewards(provider);
        this.poolBalanceSBTC = this.poolBalanceSBTC.minus(existingRewards);

        // calculate compounded balance
        const compoundedDeposit = this.calculateCurrentDeposit(provider);

        this.providers.set(stabilityProvider, { ...provider, deposited: compoundedDeposit.plus(amount), sum_t: this.sum, product_t: this.product });

        this.poolBalanceBSD = this.poolBalanceBSD.add(amount);

        this.report.addAction(`Deposited ${amount} BSD for provider: ${stabilityProvider}`);
    }

    withdrawStability(amount: Decimal, stabilityProvider: string) {

        const provider = this.providers.get(stabilityProvider);
        if (!provider) {
            console.log(`Provider does not exist`);
            return;
        }

        // pay out existing rewards
        const existingRewards = this.calculateCurrentRewards(provider);
        this.poolBalanceSBTC = this.poolBalanceSBTC.minus(existingRewards);

        // calculate compounded balance
        const compoundedDeposit = this.calculateCurrentDeposit(provider);

        this.providers.set(stabilityProvider, { ...provider, deposited: compoundedDeposit.minus(amount), sum_t: this.sum, product_t: this.product });

        this.poolBalanceBSD = this.poolBalanceBSD.minus(amount);

        this.report.addAction(`Withdrew ${amount} BSD for provider: ${stabilityProvider}`);
    }

    // Method to calculate current rewards for a provider
    private calculateCurrentRewards(provider: Provider): Decimal {
        const rewards = (provider.deposited).mul(this.sum.sub(provider.sum_t)).div(provider.product_t);
        return rewards;
    }

    // Method to calculate current deposit for a provider
    private calculateCurrentDeposit(provider: Provider): Decimal {

        if (provider.deposited.eq(0)) {
            return new Decimal(0);
        }

        const compoundedDeposit = provider.deposited.mul(this.product).div(provider.product_t);
        return compoundedDeposit;
    }

    // Method to handle liquidation
    liquidate(bsd: Decimal, sbtc: Decimal) {

        this.sum = this.sum.add(sbtc.div(this.poolBalanceBSD).mul(this.product));
        this.product = this.product.mul(new Decimal(1).sub(bsd.div(this.poolBalanceBSD)));

        this.poolBalanceBSD = this.poolBalanceBSD.sub(bsd);
        this.poolBalanceSBTC = this.poolBalanceSBTC.add(sbtc);

        this.report.addAction(`Liquidated ${bsd} BSD for ${sbtc} SBTC`);
    }

    // Method to reconcile the rewards
    reconcile() {
        let aggregateBalance = new Decimal(0);
        let aggregateRewards = new Decimal(0);
        this.providers.forEach((provider) => {
            const providerRewards = this.calculateCurrentRewards(provider);
            aggregateRewards = aggregateRewards.plus(providerRewards);
            const providerBalance = this.calculateCurrentDeposit(provider);
            aggregateBalance = aggregateBalance.plus(providerBalance);
            this.report.addReconciliationRow({ provider: provider.id, rewards: providerRewards, balance: providerBalance, poolRewards: this.poolBalanceSBTC, poolBalance: this.poolBalanceBSD });
        });
        assert(aggregateBalance.minus(this.poolBalanceBSD).abs().lessThan(TOLERANCE), `Pool balance mismatch: aggregateBalance: ${aggregateBalance}, poolBalanceBSD: ${this.poolBalanceBSD}`);
        assert(aggregateRewards.minus(this.poolBalanceSBTC).abs().lessThan(TOLERANCE), `Sum mismatch: aggregateRewards: ${aggregateRewards}, poolBalanceSBTC: ${this.poolBalanceSBTC}`);
    }
}


