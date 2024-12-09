import Decimal from 'decimal.js';
import { ProtocolVault } from "../model/protocol-vault";
import { Report } from '../util/report';

export const executeScenario = (): any => {

    // Create an instance of StabilityPool
    const report = new Report();
    const stabilityPool = new ProtocolVault(report);
    stabilityPool.createVault('Alice', new Decimal(10000), new Decimal(.15));
    stabilityPool.createVault('Bob', new Decimal(20000), new Decimal(.30));
    stabilityPool.redistribute(new Decimal(3000), new Decimal(.25))
    stabilityPool.redistribute(new Decimal(3000), new Decimal(.25))
    stabilityPool.repay(new Decimal(1000), 'Alice');
    stabilityPool.repay(new Decimal(2000), 'Bob');
    stabilityPool.borrow(new Decimal(2000), 'Alice');
    stabilityPool.redistribute(new Decimal(9000), new Decimal(.25))
    stabilityPool.reconcile();
    return { report }
}

let { report } = executeScenario();
report.getReport()