/**
 * Copyright (c) Facebook, Inc. and its affiliates. All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {Context} from 'vm';
import type {Config} from '@jest/types';
import type * as Intendant from './intendant/types';

export type EnvironmentContext = {
  console: Console;
  benchPath: Config.Path;
};

// Different Order than https://nodejs.org/api/modules.html#modules_the_module_wrapper , however needs to be in the form [jest-transform]ScriptTransformer accepts
export type ModuleWrapper = (
  this: Module['exports'],
  module: Module,
  exports: Module['exports'],
  require: Module['require'],
  __dirname: string,
  __filename: Module['filename'],
) => unknown;

export declare class CoffererEnvironment {
  constructor(config: Config.ProjectConfig, context?: EnvironmentContext);
  public global: {};
  public getVmContext(): Context | null;
  public setup(): Promise<void>;
  public teardown(): Promise<void>;
  public handleBenchEvent?: Intendant.EventHandler;
}

export type Module = NodeModule;
