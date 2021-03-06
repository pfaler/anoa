import PouchDB from 'pouchdb';
import { timeSince } from '../utils/util';

/* global location */
const remoteUrl = `${location.protocol}//${location.host}/db/`;

/**
 * @param {sting} id of the database
 */
export function useExistingDatabase(id) {
  const config = {
    skip_setup: true,
  };

  const database = {
    local: new PouchDB(id),
    remote: new PouchDB(`${remoteUrl}${id}`, config),
  };

  return Promise.resolve(database);
}

export function checkForRemoteDatabase(database) {
  const { remote } = database;

  return new Promise((resolve, reject) => {
    remote.info()
    .then(() => {
      resolve(database);
    })
    .catch(() => {
      reject(database);
    });
  });
}

export function replicateFromRemoteDatabase(database) {
  const { local, remote } = database; 
  return new Promise((resolve, reject) => {
    local.replicate.from(remote)
    .then(() => {
      resolve(database);
    })
    .catch(() => {
      reject(database);
    });
  });
}

/**
 * @param {sting} id of the database
 */
export function createNewDatabase(id) {
  const database = {
    local: new PouchDB(id),
    remote: new PouchDB(`${remoteUrl}${id}`),
  };

  return Promise.resolve(database);
}

/**
 * @param {object} database object containing a local and a remote database
 * @param {string} channel name to store in the database
 */
export function setDatabaseMeta(database, name) {
  return database.local.put({
    _id: 'meta',
    name,
    time: new Date(),
  })
  .then(() => database.local.replicate.to(database.remote))
  .then(() => new Promise((resolve) => {
    resolve(database);
  }));
}

/**
 * @param {func} dispatch function
 * @param {object} database object containing a local and a remote database
 */
export function setDatabaseInState(dispatch, database) {
  return new Promise((resolve) => {
    dispatch({
      type: 'DATABASE_SET',
      payload: database,
    });
    resolve(database);
  });
}

/**
 * @param {object} local database reference
 */
export function getDatabaseMeta(database) {
  return database.local.get('meta');
}

/**
 * @param {object} database object containing a local and a remote database
 * @param {object} new question object
 */
export function storeQuestionInDatabase(database, newQuestion) {
  const { local, remote } = database;

  return local.put(newQuestion)
  .then(() => local.replicate.to(remote));
}

/**
 * @param {object} database object containing a local and a remote database
 * @param {object} new answer object
 */
export function storeAnswerInDatabase(database, newAnswer) {
  const { local, remote } = database;

  return local.put(newAnswer)
  .then(() => local.replicate.to(remote));
}

/**
 * @param {object} database object containing a local and a remote database
 * @param {object} new answer object
 */
export function getQuestions(database) {
  return database.local.allDocs({
    startkey: 'question@',
    endkey: 'question@\uffff',
    include_docs: true,
  });
}

/**
 * @param {array} Array containing all question objects of the channel
 * @param {object} Local pouchDB reference
 */
export function getAnswers(questions, database) {
  if (questions.rows <= 0) {
    return new Promise((resolve) => {
      resolve([]);
    });
  }

  // This is pretty bad to read.. should come up with clearer way
  return Promise.all(
    questions.rows.map((questionDoc) => database.local.allDocs({
      startkey: `answer@${questionDoc.doc._id}`,
      endkey: `answer@${questionDoc.doc._id}\uffff`,
      include_docs: true,
    })
    .then((questionAnswers) => new Promise((resolve) => {
      if (questionAnswers.rows <= 0) {
        resolve(Object.assign({}, questionDoc.doc, {
          answers: [],
          expanded: false,
          time: timeSince(Date.parse(questionDoc.doc.time)),
          answerInput: '',
        }));
      } else {
        resolve(Object.assign({}, questionDoc.doc, {
          answers: questionAnswers.rows.map((answerDoc) => answerDoc.doc),
          expanded: false,
          time: timeSince(Date.parse(questionDoc.doc.time)),
          answerInput: '',
        }));
      }
    })))
  );
}
