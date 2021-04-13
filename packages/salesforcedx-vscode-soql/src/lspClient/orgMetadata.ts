/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { DescribeSObjectResult, Field } from 'jsforce';

import { getRootWorkspaceSfdxPath } from '@salesforce/salesforcedx-utils-vscode/out/src';
import { retrieveSObject, retrieveSObjects, channelService } from '../sfdx';
import { nls } from '../messages';
import * as fs from 'fs';
import * as path from 'path';

export interface OrgDataSource {
  retrieveSObjectsList(): Promise<string[]>;
  retrieveSObject(sobjectName: string): Promise<MinSObjectMeta | undefined>;
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
  private getLocalDatapath(): string | undefined {
    const sfdxPath = getRootWorkspaceSfdxPath();
    if (!sfdxPath) {
      const message = nls.localize('error_no_workspace_folder');
      channelService.appendLine(message);
      return undefined;
    }
    return path.join(sfdxPath, 'tools', 'soqlMetadata');
  }

  public async retrieveSObjectsList(): Promise<string[]> {
    const soqlMetadataPath = this.getLocalDatapath();
    if (!soqlMetadataPath) {
      return [];
    }

    try {
      const files = await fs.promises.readdir(soqlMetadataPath);
      return files
        .filter(fileName => fileName.endsWith('.json'))
        .map(fileName => fileName.replace(/.json$/, ''));
    } catch (e) {
      const message = nls.localize(
        'error_sobjects_fs_request',
        soqlMetadataPath
      );
      channelService.appendLine(message);
      return [];
    }
  }

  public async retrieveSObject(
    sobjectName: string
  ): Promise<MinSObjectMeta | undefined> {
    const soqlMetadataPath = this.getLocalDatapath();
    if (!soqlMetadataPath) {
      return undefined;
    }
    const filePath = path.join(soqlMetadataPath, sobjectName + '.json');
    try {
      const file = await fs.promises.readFile(filePath);
      // TODO: validate content against a schema
      return JSON.parse(file.toString());
    } catch (e) {
      const message = nls.localize(
        'error_sobject_metadata_fs_request',
        sobjectName,
        filePath
      );
      channelService.appendLine(message);
      return undefined;
    }
  }
}

export class JsforceOrgDataSource implements OrgDataSource {
  async retrieveSObjectsList(): Promise<string[]> {
    try {
      return await retrieveSObjects();
    } catch (metadataError) {
      const message = nls.localize('error_sobjects_request');
      channelService.appendLine(message);
      return [];
    }
  }

  async retrieveSObject(
    sobjectName: string
  ): Promise<MinSObjectMeta | undefined> {
    try {
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
