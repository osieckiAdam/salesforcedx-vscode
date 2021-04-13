/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { DescribeSObjectResult, Field } from 'jsforce';

import {
  getRootWorkspaceSfdxPath,
  hasRootWorkspace,
  TelemetryService
} from '@salesforce/salesforcedx-utils-vscode/out/src';
import { JsonMap } from '@salesforce/ts-types';
import * as vscode from 'vscode';
import { retrieveSObject, retrieveSObjects, channelService } from '../sfdx';
import { nls } from '../messages';
import * as fs from 'fs';

import * as path from 'path';

export interface OrgDataSource {
  retrieveSObjectsList(): Promise<string[]>;
  retrieveSObject(sobjectName?: string): Promise<MinSObjectMeta | undefined>;
}

export type MinFieldMeta = Pick<
  Field,
  | 'aggregatable'
  | 'defaultValue'
  | 'filterable'
  | 'groupable'
  | 'label'
  | 'name'
  | 'nillable'
  | 'picklistValues'
  | 'relationshipName'
  | 'referenceTo'
  | 'sortable'
  | 'type'
>;

export type MinSObjectMeta = Pick<
  DescribeSObjectResult,
  'childRelationships' | 'label' | 'custom' | 'name' | 'queryable'
> & {
  fields: MinFieldMeta[];
};

export class FileSystemOrgDataSource implements OrgDataSource {
  private getLocalDatapath() {
    if (!hasRootWorkspace()) {
      throw new Error('Unable to load workspace rootFolder !'); // TODO: nls localize
    }

    return path.join(
      // TODO: extract these paths
      getRootWorkspaceSfdxPath(),
      'tools',
      'soqlMetadata'
    );
  }

  public async retrieveSObjectsList(): Promise<string[]> {
    const soqlMetadataPath = this.getLocalDatapath();

    try {
      const files = await fs.promises.readdir(soqlMetadataPath);
      return files
        .filter(fileName => fileName.endsWith('.json'))
        .map(fileName => fileName.replace(/.json$/, ''));
    } catch (err) {
      // TODO: localize ?
      const message = 'Unable to read metadata for SObjects';
      channelService.appendLine(message);
      throw new Error(message);
    }
  }

  public async retrieveSObject(
    sobjectName?: string
  ): Promise<MinSObjectMeta | undefined> {
    const soqlMetadataPath = this.getLocalDatapath();

    try {
      const file = await fs.promises.readFile(
        path.join(soqlMetadataPath, sobjectName + '.json')
      );
      // TODO: validate content against a schema
      return JSON.parse(file.toString());
    } catch (err) {
      // TODO: extract message ?
      const message = 'Unable to read metadata for SObject name ' + sobjectName;
      channelService.appendLine(message);
      throw new Error(message);
    }
  }
}

export class JsforceOrgDataSource implements OrgDataSource {
  async retrieveSObjectsList(): Promise<string[]> {
    try {
      // generateLocalSobjectJSON();
      return await retrieveSObjects();
    } catch (metadataError) {
      const message = nls.localize('error_sobjects_request');
      channelService.appendLine(message);
      return [];
    }
  }

  async retrieveSObject(
    sobjectName?: string
  ): Promise<MinSObjectMeta | undefined> {
    try {
      if (!sobjectName) {
        TelemetryService.getInstance().sendException(
          'SOQLanguageServerException',
          'Missing `sobjectName` from SOQL completion context!'
        );
        return Promise.resolve(undefined);
      }
      return toMinimalSObject(await retrieveSObject(sobjectName));
    } catch (metadataError) {
      const message = nls.localize(
        'error_sobject_metadata_request',
        sobjectName
      );
      channelService.appendLine(message);
      return undefined;
    }
  }
}

function toMinimalSObject(
  describeSObject: DescribeSObjectResult
): MinSObjectMeta {
  return {
    fields: describeSObject.fields.map(toMinimalSObjectField),
    childRelationships: (describeSObject.childRelationships || []).filter(
      r => r.relationshipName !== null
    ),
    ...pick(describeSObject, 'label', 'custom', 'name', 'queryable')
  };
}

function toMinimalSObjectField(describeField: Field): MinFieldMeta {
  return pick(
    describeField,
    'label',
    'name',
    'aggregatable',
    'defaultValue',
    'filterable',
    'groupable',
    'nillable',
    'picklistValues',
    'relationshipName',
    'referenceTo',
    'sortable',
    'type'
  );
}

function pick<T, K extends keyof T>(obj: T, ...keys: K[]): Pick<T, K> {
  const ret: any = {};
  keys.forEach(key => {
    ret[key] = obj[key];
  });
  return ret;
}

export async function generateLocalSobjectJSON() {
  const sobjectNames = [
    'Account',
    'Attachment',
    'Case',
    'Contact',
    'Contract',
    'Lead',
    'Note',
    'Opportunity',
    'Order',
    'Pricebook2',
    'PricebookEntry',
    'Product2',
    'RecordType',
    'Report',
    'Task',
    'User'
  ];

  for (const sobjectName of sobjectNames) {
    const localPath = path.join('/tmp', 'soqlMetadata', sobjectName + '.json');
    const sobject = await retrieveSObject(sobjectName);
    fs.writeFileSync(localPath, JSON.stringify(toMinimalSObject(sobject)));
  }
}
