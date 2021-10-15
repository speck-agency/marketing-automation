import * as hubspot from '@hubspot/api-client';
import { HubspotEntity } from "./entity.js";

export type HubspotInputObject = {
  id: string,
  properties: { [key: string]: string },
  createdAt: Date,
  updatedAt: Date,
  archived?: boolean,
  archivedAt?: Date,
  associations?: {
    [key: string]: {
      results: {
        id: string,
        type: string,
      }[],
    },
  },
};

export type HubspotEntityKind = 'deal' | 'contact' | 'company';

export abstract class HubspotEntityManager<
  P extends { [key: string]: any },
  E extends HubspotEntity<P>,
  I extends HubspotInputObject>
{

  constructor(private client: hubspot.Client) { }

  abstract Entity: new (id: string | null, props: P) => E;
  abstract kind: HubspotEntityKind;
  abstract associations: [keyof E, HubspotEntityKind][];

  abstract apiProperties: string[];
  abstract fromAPI(data: I['properties']): P;
  abstract toAPI(props: P): I['properties'];

  api() {
    switch (this.kind) {
      case 'deal': return this.client.crm.deals;
      case 'company': return this.client.crm.companies;
      case 'contact': return this.client.crm.contacts;
    }
  }

  async downloadAllEntities() {
    let associations: undefined | string[];
    if (this.associations.length > 0) {
      associations = this.associations.map(a => a[1]);
    }
    const data = await this.api().getAll(undefined, undefined, this.apiProperties, associations);
    const entities = data.map(raw => {
      const props = this.fromAPI(raw.properties);
      const entity = new this.Entity(raw.id, props);

      // for (const [container, other] of this.associations) {
      //   entity[container];
      // }

      return entity;
    });
    return entities;
  }

}
