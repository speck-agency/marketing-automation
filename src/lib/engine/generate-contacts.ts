import assert from 'assert';
import capitalize from 'capitalize';
import { Contact, GeneratedContact } from '../types/contact.js';
import { License } from '../types/license.js';
import { Transaction } from '../types/transaction.js';
import { nonBlankString, sorter } from '../util/helpers.js';

export function generateContacts({ licenses, transactions, initialContacts, partnerDomains }: {
  licenses: License[],
  transactions: Transaction[],
  initialContacts: Contact[],
  partnerDomains: Set<string>,
}): GeneratedContact[] {
  const generatedContacts = normalizeContacts({ licenses, transactions, partnerDomains });

  const finalContacts = mergeDuplicateContacts(generatedContacts, initialContacts);

  assert.ok(finalContacts.every(c => (
    c.contact_type.length > 0 &&
    c.country.length > 0 &&
    c.region.length > 0 &&
    c.hosting.length > 0 &&
    c.email.length > 0 &&

    (c.firstname === null || c.firstname.length > 0) &&
    (c.lastname === null || c.lastname.length > 0) &&
    (c.phone === null || c.phone.length > 0) &&
    (c.city === null || c.city.length > 0) &&
    (c.state === null || c.state.length > 0) &&

    c.deployment === undefined &&
    c.last_mpac_event === undefined &&
    c.license_tier === undefined &&
    c.related_products === undefined
  )));

  return finalContacts;
}

function mergeDuplicateContacts(generatedContacts: TmpContact[], initialContacts: Contact[]): GeneratedContact[] {
  const map = new Map<string, TmpContact[]>();

  // Merge all generated contacts into an array.
  for (const contact of generatedContacts) {
    if (!map.has(contact.email)) map.set(contact.email, []);
    map.get(contact.email)?.push(contact);
  }

  // Merge secondary-email contact arrays into primary-email contact arrays.
  // Primary/secondary emails are only available in HubSpot contacts.
  // For any contact this loop skips, it means there's no HubSpot contact.
  for (const { email, otherEmails } of initialContacts) {
    // Only deal with HubSpot contacts that have secondary emails.
    if (otherEmails.length === 0) continue;

    // If we didn't generate a contact with the primary-email, create an empty list now.
    // This can happen if the customer only used secondary-email for licenses/transactions.
    let primarySet = map.get(email);
    if (!primarySet) map.set(email, primarySet = []);

    for (const other of otherEmails) {
      const otherSet = map.get(other);
      if (otherSet) {
        map.delete(other);
        primarySet.push(...otherSet);
      }
    }

    // We didn't end up adding any, so remove it.
    // (There's probably a much better way to write this function.)
    if (primarySet.length === 0) {
      map.delete(email);
    }
  }

  for (const [primaryEmail, contacts] of map) {
    if (contacts.length > 1) {
      mergeContactProperties(primaryEmail, contacts);
    }
  }

  // Don't need "updated" anymore
  return [...map.values()].map(([{ updated, ...cs }]) => cs);
}

export function mergeContactProperties(primaryEmail: string, contacts: TmpContact[]) {
  contacts.sort(sorter(c => c.updated, 'DSC'));

  const ideal = contacts[0];
  ideal.email = primaryEmail;

  if (ideal.contact_type === 'Customer' && contacts.some(c => c.contact_type === 'Partner')) {
    ideal.contact_type = 'Partner';
  }

  const hasName = contacts.find(c => c.firstname && c.lastname);
  if (hasName) {
    ideal.firstname = hasName.firstname;
    ideal.lastname = hasName.lastname;
  }
  else {
    const hasFirstName = contacts.find(c => c.firstname);
    if (hasFirstName) ideal.firstname = hasFirstName.firstname;

    const hasLastName = contacts.find(c => c.lastname);
    if (hasLastName) ideal.lastname = hasLastName.lastname;
  }

  const hasPhone = contacts.find(c => c.phone);
  if (hasPhone) {
    ideal.phone = hasPhone.phone;
  }

  const hasAddress = contacts.find(c => c.city && c.state);
  if (hasAddress) {
    ideal.city = hasAddress.city;
    ideal.state = hasAddress.state;
  }
  else {
    const hasCity = contacts.find(c => c.city);
    if (hasCity) ideal.city = hasCity.city;

    const hasState = contacts.find(c => c.state);
    if (hasState) ideal.state = hasState.state;
  }
}

function normalizeContacts({ licenses, transactions, partnerDomains }: {
  licenses: License[],
  transactions: Transaction[],
  partnerDomains: Set<string>,
}) {
  const generatedContacts: TmpContact[] = [];

  for (const license of licenses) {

    if (license.contactDetails.technicalContact.email) {
      generatedContacts.push({
        ...mapCommonFields(license.contactDetails.technicalContact, partnerDomains),
        ...mapLicenseSpecificFields(license),
      });
    }

    if (license.contactDetails.billingContact?.email) {
      generatedContacts.push({
        ...mapCommonFields(license.contactDetails.billingContact, partnerDomains),
        ...mapLicenseSpecificFields(license),
      });
    }

    if (license.partnerDetails?.billingContact.email) {
      generatedContacts.push({
        ...mapCommonFields(license.partnerDetails.billingContact, partnerDomains),
        ...mapLicenseSpecificFields(license),
        contact_type: 'Partner',
      });
    }

  }

  for (const transaction of transactions) {

    if (transaction.customerDetails.technicalContact.email) {
      generatedContacts.push({
        ...mapCommonFields(transaction.customerDetails.technicalContact, partnerDomains),
        ...mapTransactionSpecificFields(transaction),
      });
    }

    if (transaction.customerDetails.billingContact?.email) {
      generatedContacts.push({
        ...mapCommonFields(transaction.customerDetails.billingContact, partnerDomains),
        ...mapTransactionSpecificFields(transaction),
      });
    }

    if (transaction.partnerDetails?.billingContact.email) {
      generatedContacts.push({
        ...mapCommonFields(transaction.partnerDetails.billingContact, partnerDomains),
        ...mapTransactionSpecificFields(transaction),
        contact_type: 'Partner',
      });
    }

  }

  return generatedContacts;
}

function mapCommonFields(info: {
  email: string,
  name?: string,
  phone?: string,
  city?: string,
  state?: string,
}, partnerDomains: Set<string>) {
  let [firstName, ...lastNameGroup] = (info.name || ' ').split(' ');
  let lastName = lastNameGroup.filter(n => n).join(' ');

  const NAME_URL_RE = /(.)\.([a-zA-Z]{2})/g;
  if (firstName.match(NAME_URL_RE)) firstName = firstName.replace(NAME_URL_RE, '$1_$2');
  if (lastName.match(NAME_URL_RE)) lastName = lastName.replace(NAME_URL_RE, '$1_$2');

  const domain = info.email.split('@')[1];

  return {
    email: info.email,
    firstname: nonBlankString(capitalize.words(firstName)),
    lastname: nonBlankString(capitalize.words(lastName)),
    phone: nonBlankString(info.phone),
    city: nonBlankString(info.city ? capitalize.words(info.city) : null),
    state: nonBlankString(info.state ? capitalize.words(info.state) : null),
    company_id: null,
    contact_type: (
      partnerDomains.has(domain) ? 'Partner' : 'Customer'
    ) as any,
  };
}

function mapLicenseSpecificFields(license: License) {
  return {
    country: capitalize.words(license.contactDetails.country),
    region: license.contactDetails.region,
    hosting: license.hosting,
    updated: license.lastUpdated,
  };
}

function mapTransactionSpecificFields(transaction: Transaction) {
  return {
    country: capitalize.words(transaction.customerDetails.country),
    region: transaction.customerDetails.region,
    hosting: transaction.purchaseDetails.hosting,
    updated: transaction.purchaseDetails.saleDate,
  };
}

export type TmpContact = GeneratedContact & { updated: string };
