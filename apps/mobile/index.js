import React from 'react';

// Polyfill React 19 Client Internals for React Native Fabric Renderer when running with React 18
const secret = (React && React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED) || {};
if (React) {
  const ClientInternalsBridge = {
    get H() { return secret.ReactCurrentDispatcher ? secret.ReactCurrentDispatcher.current : null; },
    set H(v) { if (secret.ReactCurrentDispatcher) secret.ReactCurrentDispatcher.current = v; },
    get A() { return secret.ReactCurrentActQueue ? secret.ReactCurrentActQueue.current : null; },
    set A(v) { if (secret.ReactCurrentActQueue) secret.ReactCurrentActQueue.current = v; },
    T: null,
    S: null,
    actQueue: null,
    isBatchingLegacy: false,
    didScheduleLegacyUpdate: false,
    didUsePromise: false,
    asyncTransitions: null,
    thrownErrors: [],
    recentlyCreatedOwnerStacks: null,
    getCurrentStack: null,
  };
  React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = ClientInternalsBridge;
}

import { registerRootComponent } from 'expo';
import App from './App';

function Root() {
  const Component = typeof App === 'function' ? App : (App && typeof App.default === 'function' ? App.default : null);
  if (!Component) {
    return null;
  }
  return React.createElement(Component);
}

registerRootComponent(Root);
