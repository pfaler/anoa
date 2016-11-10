import shortid from 'shortid';
import {
  setDatabaseInState,
  getDatabaseMeta,
  getQuestions,
  getAnswers,
  storeQuestionInDatabase,
  storeAnswerInDatabase,
  useExistingDatabase,
  checkForRemoteDatabase,
  replicateFromRemoteDatabase,
} from '../../database/database.actions';

/**
 * @param {object} contins meta indormation about the channel
 * @param {string} the channel id
 * @param {func} dispatch function
 */
function setChannelMeta(meta, id, dispatch) {
  return new Promise((resolve) => {
    dispatch({
      type: 'CHANNEL_SET_TITLE',
      payload: meta.name,
    });
    dispatch({
      type: 'CHANNEL_SET_ID',
      payload: id,
    });
    resolve();
  });
}


/**
 * @param {func} dispatch function
 * @param {object} the current state
 * @param {string} the channel id
 */
function refreshChannelState(dispatch, database, id) {
  return new Promise((resolve, reject) => {
    getDatabaseMeta(database)
    .then((meta) => setChannelMeta(meta, id, dispatch))
    .then(() => getQuestions(database))
    .then((questions) => getAnswers(questions, database))
    .then((questionsWithAnswers) => {
      dispatch({
        type: 'CHANNEL_SET_INITIAL_QUESTIONS',
        payload: questionsWithAnswers,
      });
      resolve(database);
    })
    .catch((err) => {
      reject(database);
    });
  });
}

/**
 * @param {func} dispatch function
 * @param {object} new question recieved trough change stream
 */
function addQuestionFromRemote(dispatch, question) {
  dispatch({
    type: 'CHANNEL_ADD_QUESTION',
    payload: [].concat(Object.assign({}, question, {
      expanded: false,
      answers: [],
      time: '0 seconds ago',
      answerInput: '',
    })),
  });
}

/**
 * @param {func} dispatch function
 * @param {func} getState function
 * @param {object} new answer recieved trough change stream
 */
function addAnswerFromRemote(dispatch, getState, answer) {
  const answerParentQuestionID = answer._id.match(/answer@(.*)@/)[1];
  const parentQuestion = getQuestionFromState(getState, answerParentQuestionID);

  if (parentQuestion) {
    dispatch({
      type: 'CHANNEL_ADD_ANSWER',
      payload: {
        question: parentQuestion,
        answer: [answer],
      },
    });
  }
}

/**
 * @param {func} getState function
 * @param {string} id of the question to find
 */
function getQuestionFromState(getState, questionID) {
  const { channelQuestions } = getState();

  for (let i = 0; i < channelQuestions.length; ++i) {
    if (questionID === channelQuestions[i]._id) {
      return channelQuestions[i];
    }
  }
  return false;
}

/**
 * @param {string} channel id
 */
export function initializeChannelAction(id) {
  return (dispatch) => {
    useExistingDatabase(id)
    .then((database) => setDatabaseInState(dispatch, database))
    .then((database) => refreshChannelState(dispatch, database, id))
    .catch((database) => {
      checkForRemoteDatabase(database)
      .then(() => replicateFromRemoteDatabase(database))
      .then(() => refreshChannelState(dispatch, database, id))
      .catch(() => {
        // Oh noes
      });
    });
  };
}

/**
 * @param {object} question to expand or shrink
 */
export function toggleQuestion(questionToToggle) {
  return {
    type: 'CHANNEL_TOGGLE_QUESTION',
    payload: {
      questionToToggle,
      expand: !questionToToggle.expanded,
    },
  };
}

export function addNewQuestion() {
  return (dispatch, getState) => {
    if (!getState().database.local) {
      return;
    }

    if (!getState().channelInput) {
      return;
    }

    const newQuestion = {
      _id: `question@${shortid.generate()}`,
      text: getState().channelInput,
      time: new Date(),
    };

    storeQuestionInDatabase(getState().database, newQuestion)
    .then(() => {
      dispatch({
        type: 'CHANNEL_ADD_QUESTION',
        payload: [].concat(Object.assign({}, newQuestion, {
          expanded: false,
          answers: [],
          time: '0 seconds ago',
          answerInput: '',
        })),
      });
      dispatch(updateQuestionInput(''));
      dispatch({
        type: 'CHANNEL_UPDATE_NOTIFICATION',
        payload: 'Question stored.',
      });
    })
    .catch(() => {
      dispatch({
        type: 'CHANNEL_UPDATE_NOTIFICATION',
        payload: 'Something went wrong, please try again.',
      });
    });
  };
}

/**
 * @param {object} the parent question that recieved a new answer
 */
export function storeQuestionAnswer(targetQuestion) {
  return (dispatch, getState) => {
    if (!getState().database.local) {
      return;
    }

    if (!targetQuestion.answerInput) {
      return;
    }

    const newAnswer = {
      _id: `answer@${targetQuestion._id}@${shortid.generate()}`,
      text: targetQuestion.answerInput,
      time: new Date(),
    };

    storeAnswerInDatabase(getState().database, newAnswer)
    .then(() => {
      dispatch({
        type: 'CHANNEL_ADD_ANSWER',
        payload: {
          question: targetQuestion,
          answer: [newAnswer],
        },
      });
      dispatch(updateQuestionAnswerInput(targetQuestion, ''));
    });
  };
}

export function toggleLiveChanges() {
  return (dispatch, getState) => {
    const { local, remote } = getState().database;
    const { liveChanges } = getState();

    if (!local || !remote) {
      return;
    }

    if (liveChanges) {
      liveChanges.cancel();
      dispatch({
        type: 'CHANNEL_TOGGLE_LIVE_CHANGES',
        payload: false,
      });
      return;
    }

    const liveChangesInstance = local.sync(remote, { live: true, retry: true })
    .on('change', (change) => {
      const newDocs = change.change.docs;

      newDocs.forEach((doc) => {
        if (doc._id.indexOf('answer@') !== -1 && doc._id.indexOf('question@') !== -1) { // the doc is an answer
          addAnswerFromRemote(dispatch, getState, doc);
        } else if (doc._id.indexOf('question@') !== -1) { // The doc is a question
          addQuestionFromRemote(dispatch, doc);
        }
      });
    })
    .on('error', () => {
      // Do something about live changes error
    });

    dispatch({
      type: 'CHANNEL_TOGGLE_LIVE_CHANGES',
      payload: liveChangesInstance,
    });
  };
}

/**
 * @param {objetc} Question that owns the input field that should be updated
 * @param {string} The new input value
 */
export function updateQuestionAnswerInput(question, answerInput) {
  return {
    type: 'CHANNEL_UPDATE_QUESTION_ANSWER_INPUT',
    payload: {
      question,
      answerInput,
    },
  };
}

/**
 * @param {string} The new input value
 */
export function updateQuestionInput(payload) {
  return {
    type: 'CHANNEL_UPDATE_INPUT',
    payload,
  };
}