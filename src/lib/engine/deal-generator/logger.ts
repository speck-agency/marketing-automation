import { v4 as uuidv4 } from "uuid";
import DataDir, { LogWriteStream } from "../../cache/datadir.js";
import { Table } from "../../log/table.js";
import { DealData } from "../../model/deal.js";
import { License } from "../../model/license.js";
import { Transaction } from "../../model/transaction.js";
import { formatMoney } from "../../util/formatters.js";
import { Action } from "./actions.js";
import { abbrEventDetails, DealRelevantEvent } from "./events.js";

type RedactIdFn = <T extends string | undefined>(prefix: string, id: T) => T;

const sameId = <T extends string | undefined>(prefix: string, x: T) => x;

export class DealDataLogger {

  plainLog = DataDir.out.file('deal-generator.txt').writeStream();
  rededLog = DataDir.out.file('deal-generator-redacted.txt').writeStream();

  redactions = new Map<string, string>();
  newIds = new Set<string>();

  close() {
    this.plainLog.close();
    this.rededLog.close();
  }

  redact<T extends string | undefined>(prefix: string, id: T): T {
    if (typeof id === 'undefined') return id;

    let rid = this.redactions.get(id);
    if (!rid) {
      do { rid = prefix + uuidv4().replace(/-/g, '').slice(0, 10); }
      while (this.newIds.has(rid));
      this.newIds.add(rid);
      this.redactions.set(id, rid)
    };
    return rid as T;
  }

  logActions(actions: Action[]) {
    const redact = this.redact.bind(this);
    this._logActions(this.plainLog, sameId, actions);
    this._logActions(this.rededLog, redact, actions);
  }

  redactedDealProperties(data: Partial<DealData>) {
    return data;
  }

  printDealProperties(log: LogWriteStream, data: Partial<DealData>) {
    for (const [k, v] of Object.entries(data)) {
      log.writeLine(`    ${k}: ${v}`);
    }
  }

  private _logActions(log: LogWriteStream, redact: RedactIdFn, actions: Action[]) {
    log.writeLine('Actions');
    for (const action of actions) {
      switch (action.type) {
        case 'create':
          log.writeLine('  Create:');
          this.printDealProperties(log, this.redactedDealProperties(action.properties));
          break;
        case 'update':
          log.writeLine(`  Update: ${redact('D_', action.deal.id)}`);
          this.printDealProperties(log, this.redactedDealProperties(action.properties));
          break;
        case 'noop':
          log.writeLine(`  Nothing: ${redact('D_', action.deal.id)}`);
          break;
      }
    }
  }

  logRecords(records: (License | Transaction)[]) {
    const redact = this.redact.bind(this);
    this._logRecords(this.plainLog, sameId, records);
    this._logRecords(this.rededLog, redact, records);
  }

  private _logRecords(log: LogWriteStream, redact: RedactIdFn, records: (License | Transaction)[]) {
    const ifTx = (fn: (r: Transaction) => string) =>
      (r: License | Transaction) =>
        r instanceof Transaction ? fn(r) : '';

    log.writeLine('\n');
    Table.print({
      log: str => log.writeLine(str),
      title: 'Records',
      rows: records,
      cols: [
        [{ title: 'Hosting' }, record => record.data.hosting],
        [{ title: 'AddonLicenseId' }, record => redact('L_', record.data.addonLicenseId)],
        [{ title: 'Date' }, record => record.data.maintenanceStartDate],
        [{ title: 'LicenseType' }, record => record.data.licenseType],
        [{ title: 'SaleType' }, ifTx(record => record.data.saleType)],
        [{ title: 'Transaction' }, ifTx(record => redact('TX_', record.data.transactionId))],
        [{ title: 'Amount', align: 'right' }, ifTx(record => formatMoney(record.data.vendorAmount))],
      ],
    });
  }

  logEvents(events: DealRelevantEvent[]) {
    const redact = this.redact.bind(this);
    this._logEvents(this.plainLog, sameId, events);
    this._logEvents(this.rededLog, redact, events);
  }

  private _logEvents(log: LogWriteStream, redact: RedactIdFn, events: DealRelevantEvent[]) {
    const rows = events.map(abbrEventDetails).map(({ type, lics, txs }) => ({
      type,
      lics: lics.map(l => redact('L_', l)),
      txs: txs.map(tx => redact('TX_', tx)),
    }));

    Table.print({
      title: 'Events',
      log: str => log.writeLine(str),
      rows: rows,
      cols: [
        [{ title: 'Type' }, row => row.type],
        [{ title: 'Licenses' }, row => row.lics?.join(', ') ?? ''],
        [{ title: 'Transactions' }, row => row.txs?.join(', ') ?? ''],
      ],
    });
  }

}
