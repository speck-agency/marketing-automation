import * as assert from 'assert';
import { saveForInspection } from '../../cache/inspection.js';
import log from '../../log/logger.js';
import { Table } from '../../log/table.js';
import { Database } from '../../model/database.js';
import { Deal } from '../../model/deal.js';
import { License, LicenseData } from '../../model/license.js';
import { Transaction } from '../../model/transaction.js';
import env from '../../parameters/env.js';
import { formatMoney } from '../../util/formatters.js';
import { isPresent, sorter } from '../../util/helpers.js';
import { RelatedLicenseSet } from '../license-matching/license-grouper.js';
import { ActionGenerator, CreateDealAction, UpdateDealAction } from './actions.js';
import { EventGenerator } from './events.js';
import { getEmails } from './records.js';

export type IgnoredLicense = LicenseData & {
  reason: string;
  details: string;
};

/** Generates deal actions based on match data */
export class DealGenerator {

  private actionGenerator: ActionGenerator;

  private dealCreateActions: CreateDealAction[] = [];
  private dealUpdateActions: UpdateDealAction[] = [];

  private ignoredLicenseSets: (IgnoredLicense)[][] = [];
  private ignoredAmounts = new Map<string, number>();

  private partnerTransactions = new Set<Transaction>();

  constructor(private db: Database) {
    this.actionGenerator = new ActionGenerator(db.dealManager);
  }

  run(matches: RelatedLicenseSet[]) {
    for (const relatedLicenseIds of matches) {
      this.generateActionsForMatchedGroup(relatedLicenseIds);
    }

    saveForInspection('ignored', this.ignoredLicenseSets);

    for (const [reason, amount] of this.ignoredAmounts) {
      this.db.tallier.less(reason, amount);
    }
    log.info('Deal Actions', 'Amount of Transactions Ignored', [...this.ignoredAmounts].map(([reason, amount]) => [reason, formatMoney(amount)]));

    this.printPartnerTransactionsTable();

    for (const { groups, properties } of this.dealCreateActions) {
      const deal = this.db.dealManager.create(properties);
      this.associateDealContactsAndCompanies(groups, deal);
    }

    for (const { deal, groups } of this.dealUpdateActions) {
      this.associateDealContactsAndCompanies(groups, deal);
    }
  }

  private printPartnerTransactionsTable() {
    const table = new Table(4);
    for (const t of this.partnerTransactions) {
      const emails = [...new Set(getEmails(t))].join(', ');
      const amount = formatMoney(t.data.vendorAmount);
      table.addRow([[t.id], [t.data.saleDate], [amount, 'right'], [emails]]);
    }

    log.warn('Deal Actions', 'Partner amounts');
    for (const row of table.eachRow()) {
      log.warn('Deal Actions', '  ' + row);
    }
  }

  private generateActionsForMatchedGroup(groups: RelatedLicenseSet) {
    assert.ok(groups.length > 0);
    if (this.ignoring(groups)) return;

    const events = new EventGenerator().interpretAsEvents(groups);
    const actions = this.actionGenerator.generateFrom(events);
    log.detailed('Deal Actions', 'Generated deal actions', actions);

    for (const action of actions) {
      switch (action.type) {
        case 'create': this.dealCreateActions.push(action); break;
        case 'update': this.dealUpdateActions.push(action); break;
        case 'noop': break;
      }
    }
  }

  private associateDealContactsAndCompanies(groups: RelatedLicenseSet, deal: Deal) {
    const records = groups.flatMap(group => [group.license, ...group.transactions]);
    const emails = [...new Set(records.flatMap(getEmails))];
    const contacts = (emails
      .map(email => this.db.contactManager.getByEmail(email))
      .filter(isPresent));
    contacts.sort(sorter(c => c.isCustomer ? -1 : 0));

    const companies = (contacts
      .filter(c => c.isCustomer)
      .flatMap(c => c.companies.getAll()));

    deal.contacts.clear();
    for (const contact of contacts) {
      deal.contacts.add(contact);
    }

    deal.companies.clear();
    for (const company of companies) {
      deal.companies.add(company);
    }
  }

  /** Ignore if every license's tech contact domain is partner or mass-provider */
  private ignoring(groups: RelatedLicenseSet) {
    const licenses = groups.map(g => g.license);
    const transactions = groups.flatMap(g => g.transactions);
    const records = [...licenses, ...transactions];
    const domains = new Set(records.map(license => license.data.technicalContact.email.toLowerCase().split('@')[1]));

    if (records.every(r => hasIgnoredApp(r.data))) {
      this.ignoreLicenses("Archived app", records[0].data.addonKey, licenses, transactions);
      return true;
    }

    const partnerDomains = [...domains].filter(domain => this.db.partnerDomains.has(domain));
    const providerDomains = [...domains].filter(domain => this.db.providerDomains.has(domain));

    if (domains.size == partnerDomains.length + providerDomains.length) {
      let reason;
      if (partnerDomains.length > 0 && providerDomains.length > 0) {
        reason = 'Partner & Mass-Provider Domains';
      }
      else if (partnerDomains.length > 0) {
        reason = 'Partner Domains';
        for (const tx of transactions) {
          this.partnerTransactions.add(tx);
        }
      }
      else if (providerDomains.length > 0) {
        reason = 'Mass-Provider Domains';
      }
      else {
        reason = 'Unknown domain issue';
      }

      this.ignoreLicenses(reason, [...domains].join(','), licenses, transactions);
      return true;
    }

    return false;
  }

  private ignoreLicenses(reason: string, details: string, licenses: License[], transactions: Transaction[]) {
    const ignoringAmount = (transactions
      .map(t => t.data.vendorAmount)
      .reduce((a, b) => a + b, 0));

    this.ignoredAmounts.set(reason,
      (this.ignoredAmounts.get(reason) ?? 0) +
      ignoringAmount);

    this.ignoredLicenseSets.push(licenses.map(license => ({
      reason,
      details,
      ...license.data,
    })));
  }

}

function hasIgnoredApp(record: { addonKey: string }) {
  return env.engine.ignoredApps.has(record.addonKey);
}
