import { LOCAL_KEYS } from './constants.js';
import { today } from './date.js';
import { read } from './storage.js';

export const state = {
  page: 'dashboard',
  scheduleType: 'class',
  temporaryDate: today,
  selectedStudent: null,
  rosterClass: '8',
  profileClass: '8',
  homeworkClass: '8',
  homeworkDate: today,
  dictationClass: '8',
  selectedDictation: null,
  testClass: '8',
  selectedTest: null,
  planClass: '8',
  resourceTab: 'links',
  groupLayout: read(LOCAL_KEYS.groupLayout, null),
  seatingLayout: read(LOCAL_KEYS.seatingLayout, null),
  pendingImport: null,
  modal: null
};
