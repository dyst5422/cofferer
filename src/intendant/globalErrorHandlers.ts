/**
 * Copyright (c) Facebook, Inc. and its affiliates. All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import type * as Intendant from './types';
import {dispatchSync} from './state';

const uncaught: NodeJS.UncaughtExceptionListener &
  NodeJS.UnhandledRejectionListener = (error: unknown) => {
  dispatchSync({error, name: 'error'});
};

export const injectGlobalErrorHandlers = (
  parentProcess: NodeJS.Process,
): Intendant.GlobalErrorHandlers => {
  const uncaughtException = process.listeners('uncaughtException').slice();
  const unhandledRejection = process.listeners('unhandledRejection').slice();
  parentProcess.removeAllListeners('uncaughtException');
  parentProcess.removeAllListeners('unhandledRejection');
  parentProcess.on('uncaughtException', uncaught);
  parentProcess.on('unhandledRejection', uncaught);
  return {uncaughtException, unhandledRejection};
};

export const restoreGlobalErrorHandlers = (
  parentProcess: NodeJS.Process,
  originalErrorHandlers: Intendant.GlobalErrorHandlers,
): void => {
  parentProcess.removeListener('uncaughtException', uncaught);
  parentProcess.removeListener('unhandledRejection', uncaught);

  for (const listener of originalErrorHandlers.uncaughtException) {
    parentProcess.on('uncaughtException', listener);
  }
  for (const listener of originalErrorHandlers.unhandledRejection) {
    parentProcess.on('unhandledRejection', listener);
  }
};
