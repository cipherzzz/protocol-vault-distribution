import { printTable } from "console-table-printer";

export class Report {

    actions: any = []
    reconciliation: any = []

    addAction = (action: any) => {
        this.actions.push({ action })
    }

    addReconciliationRow = (action: any) => {
        this.reconciliation.push(action)
    }


    getReport = () => {
        printTable(this.actions)
        printTable(this.reconciliation)
    }

}
