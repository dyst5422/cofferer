/**
 * Copyright (c) Facebook, Inc. and its affiliates. All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {Context, createContext, runInContext} from 'vm';
import type { CoffererEnvironment } from './environment';
import {installCommonGlobals} from 'jest-util';
import {bench, describe} from "./intendant";

type Global = { [key: string]: any};

type BenchEnvironmentOptions = {
  describe: typeof describe,
  bench: typeof bench,
  [key: string]: unknown
};

export class NodeEnvironment implements CoffererEnvironment {
  context: Context | null;
  global: Global;

  constructor(config: { benchEnvironmentOptions: BenchEnvironmentOptions, globals?: { [K: string]: unknown; } }) {
    this.context = createContext();
    const global = (this.global = runInContext(
      'this',
      Object.assign(this.context, config.benchEnvironmentOptions),
    ));
    global.global = global;
    global.clearInterval = clearInterval;
    global.clearTimeout = clearTimeout;
    global.setInterval = setInterval;
    global.setTimeout = setTimeout;
    global.Buffer = Buffer;
    global.setImmediate = setImmediate;
    global.clearImmediate = clearImmediate;
    global.ArrayBuffer = ArrayBuffer;
    // TextEncoder (global or via 'util') references a Uint8Array constructor
    // different than the global one used by users in tests. This makes sure the
    // same constructor is referenced by both.
    global.Uint8Array = Uint8Array;

    // URL and URLSearchParams are global in Node >= 10
    if (typeof URL !== 'undefined' && typeof URLSearchParams !== 'undefined') {
      global.URL = URL;
      global.URLSearchParams = URLSearchParams;
    }
    // TextDecoder and TextDecoder are global in Node >= 11
    if (
      typeof TextEncoder !== 'undefined' &&
      typeof TextDecoder !== 'undefined'
    ) {
      global.TextEncoder = TextEncoder;
      global.TextDecoder = TextDecoder;
    }
    // queueMicrotask is global in Node >= 11
    if (typeof queueMicrotask !== 'undefined') {
      global.queueMicrotask = queueMicrotask;
    }
    // AbortController is global in Node >= 15
    if (typeof AbortController !== 'undefined') {
      global.AbortController = AbortController;
    }
    installCommonGlobals(global, config.globals ?? {});

  }

  async setup(): Promise<void> {}

  async teardown(): Promise<void> {
    this.context = null;
  }

  getVmContext(): Context | null {
    return this.context;
  }
}

