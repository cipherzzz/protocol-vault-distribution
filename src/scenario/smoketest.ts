import Decimal from 'decimal.js';
import { StabilityPool } from "../model/stability-pool";
import { Report } from '../util/report';

export const executeScenario = (): any => {

    // Create an instance of StabilityPool
    const report = new Report();
    const stabilityPool = new StabilityPool(report);
    stabilityPool.addProvider('Alice');
    stabilityPool.addProvider('Bob');
    stabilityPool.depositStability(new Decimal(100), 'Alice');
    stabilityPool.depositStability(new Decimal(50), 'Bob');
    stabilityPool.withdrawStability(new Decimal(15), 'Bob');
    stabilityPool.liquidate(new Decimal(50), new Decimal(.01));
    stabilityPool.liquidate(new Decimal(25), new Decimal(.01));
    stabilityPool.depositStability(new Decimal(100), 'Bob');
    stabilityPool.liquidate(new Decimal(10), new Decimal(.01));
    stabilityPool.reconcile();

    return { report }
}

let { report } = executeScenario();
report.getReport()