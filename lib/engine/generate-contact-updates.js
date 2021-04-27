import * as assert from 'assert';
import _ from 'lodash';
import { ADDONKEY_TO_PLATFORM } from '../util/config.js';
import { calculateLicenseTier, parseLicenseTier, parseTransactionTier } from './tiers.js';

const PLATFORMS = _.uniq(Object.values(ADDONKEY_TO_PLATFORM));


/**
 * @param {RelatedLicenseSet[]} allMatches
 * @param {ContactsByEmail} contactsByEmail
 */
export function generateContactUpdateActions(allMatches, contactsByEmail) {
  /** @type {Map<Contact, { events: Set<string>, products: Set<string>, hostings: Set<'Server' | 'Cloud' | 'Data Center'>, tiers: Set<number> }>} */
  const contactUpdates = new Map();

  for (const group of allMatches) {
    const contacts = _.uniq(group.map(m => contactsByEmail[m.license.contactDetails.technicalContact.email]));

    for (const contact of contacts) {
      if (!contactUpdates.has(contact)) {
        contactUpdates.set(contact, {
          events: new Set(),
          hostings: new Set(),
          products: new Set(),
          tiers: new Set([-1]),
        });
      }

      const updates = contactUpdates.get(contact);
      assert.ok(updates);

      if (typeof contact.license_tier === 'number') {
        updates.tiers.add(contact.license_tier);
      }

      for (const tier of group.map(g => calculateLicenseTier(g.license.evaluationOpportunitySize))) {
        updates.tiers.add(tier);
      }

      for (const tier of group.map(g => parseLicenseTier(g.license.tier))) {
        updates.tiers.add(tier);
      }

      for (const tier of group.flatMap(g => g.transactions.map(t => parseTransactionTier(t.purchaseDetails.tier)))) {
        updates.tiers.add(tier);
      }

      for (const license of group.map(g => g.license)) {
        updates.events.add(license.maintenanceStartDate);
      }

      for (const transaction of group.flatMap(g => g.transactions)) {
        updates.events.add(transaction.purchaseDetails.saleDate);
      }

      updates.hostings.add(group[0].license.hosting);
      updates.products.add(ADDONKEY_TO_PLATFORM[group[0].license.addonKey]);
    }
  }

  /** @type {ContactUpdateAction[]} */
  const contactUpdateActions = [];

  for (const [contact, { hostings, products, tiers, events }] of contactUpdates) {
    /** @type {'Server' | 'Cloud' | 'Data Center' | 'Multiple' | undefined} */
    let deployment;
    [deployment] = hostings.size > 1 ? ['Multiple'] : hostings;
    assert.ok([null, 'Server', 'Cloud', 'Multiple', 'Data Center'].includes(deployment));

    const related_products = [...products];
    assert.ok(!related_products || related_products.every(p => PLATFORMS.includes(p)));

    const tier = [...tiers].reduce((a, b) => Math.max(a, b));
    const event = [...events].reduce((a, b) => a > b ? a : b);

    contactUpdateActions.push({ contact, deployment, related_products, tier, event });
  }

  return contactUpdateActions;
}