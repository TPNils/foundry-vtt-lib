import { isTesting } from "./is-testing";
if (isTesting) {
  import('./test-element.js');
}