import _ from "lodash";

/**
 * @param {object}                data
 * @param {Uploader}              data.uploader
 * @param {ContactUpdateAction[]} data.contactUpdateActions
 */
export async function updateContactsInHubspotAgain({ uploader, contactUpdateActions }) {
  /** @type {Array<{ id: string, properties: Partial<Contact> }>} */
  const updates = [];

  for (const action of contactUpdateActions) {
    /** @type {Partial<GeneratedContact>} */
    const properties = {};

    if (action.tier !== action.contact.license_tier) {
      action.contact.license_tier = action.tier;
      properties.license_tier = action.tier;
    }

    if (action.event !== action.contact.last_mpac_event) {
      action.contact.last_mpac_event = action.event;
      properties.last_mpac_event = action.event;
    }

    if (action.deployment && action.deployment !== action.contact.deployment) {
      action.contact.deployment = action.deployment;
      properties.deployment = action.deployment;
    }

    if (action.related_products && !_.isEqual(
      _.sortBy(action.related_products),
      _.sortBy(action.contact.related_products)
    )) {
      action.contact.related_products = action.related_products;
      properties.related_products = action.related_products;
    }

    if (Object.keys(properties).length > 0) {
      updates.push({ id: action.contact.hs_object_id, properties });
    }
  }

  await uploader.updateAllContacts(updates);
}