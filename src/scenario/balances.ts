import Decimal from 'decimal.js';
import { ProtocolVault } from "../model/protocol-vault";
import { Report } from '../util/report';

export const executeScenario = (): any => {

    // Create an instance of StabilityPool
    const report = new Report();
    const stabilityPool = new ProtocolVault(report);
    stabilityPool.createVault('Alice', new Decimal(10000), new Decimal(.15));
    stabilityPool.repayDebt(new Decimal(1000), 'Alice');
    stabilityPool.reconcileVaultBalances("Before redistribution");
    stabilityPool.redistribute(new Decimal(3000), new Decimal(.25))
    stabilityPool.reconcileVaultBalances("after redistribution");
    stabilityPool.repayDebt(new Decimal(0), 'Alice'); // Do this just to get the debt attributed
    stabilityPool.reconcileVaultBalances("after redistribution & first repay");
    return { report }
}

let { report } = executeScenario();
report.getReport()