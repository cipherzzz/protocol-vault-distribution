import Decimal from 'decimal.js';
import { ProtocolVault } from "../model/protocol-vault";
import { Report } from '../util/report';

export const executeScenario = (): any => {

    // Create an instance of StabilityPool
    const report = new Report();
    const stabilityPool = new ProtocolVault(report);
    stabilityPool.createVault('Alice', new Decimal(10000), new Decimal(.15));
    stabilityPool.createVault('Bob', new Decimal(50000), new Decimal(.75));
    stabilityPool.repay(new Decimal(1000), 'Alice');
    stabilityPool.deposit(new Decimal(.25), 'Alice');
    stabilityPool.reconcile("Before redistribution");
    stabilityPool.redistribute(new Decimal(3000), new Decimal(.25))
    stabilityPool.reconcile("after redistribution");
    stabilityPool.withdraw(new Decimal(.1), 'Alice');
    stabilityPool.repay(new Decimal(1000), 'Alice'); // Do this just to get the debt attributed
    stabilityPool.reconcile("after redistribution & first repay");
    stabilityPool.borrow(new Decimal(2000), 'Alice');
    stabilityPool.reconcile("borrow");
    stabilityPool.redistribute(new Decimal(3000), new Decimal(.25))
    stabilityPool.withdraw(new Decimal(.1), 'Bob');
    stabilityPool.reconcile("after redistribution");
    return { report }
}

let { report } = executeScenario();
report.getReport()