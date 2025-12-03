export const messageActions = {
  SET_SAVE_MESSAGE: 'SET_SAVE_MESSAGE',
  SET_LOAD_MESSAGE: 'SET_LOAD_MESSAGE',
  SET_RATE_UPDATE_MESSAGE: 'SET_RATE_UPDATE_MESSAGE',
  SET_IS_LOADING: 'SET_IS_LOADING',
  SET_IS_UPDATING_RATES: 'SET_IS_UPDATING_RATES',
  SET_IS_INITIAL_LOAD: 'SET_IS_INITIAL_LOAD',
  CLEAR_MESSAGES: 'CLEAR_MESSAGES'
} as const;

export interface MessageState {
  saveMessage: string;
  loadMessage: string;
  rateUpdateMessage: string;
  isLoading: boolean;
  isUpdatingRates: boolean;
  isInitialLoad: boolean;
}

export type MessageAction =
  | { type: typeof messageActions.SET_SAVE_MESSAGE; payload: string }
  | { type: typeof messageActions.SET_LOAD_MESSAGE; payload: string }
  | { type: typeof messageActions.SET_RATE_UPDATE_MESSAGE; payload: string }
  | { type: typeof messageActions.SET_IS_LOADING; payload: boolean }
  | { type: typeof messageActions.SET_IS_UPDATING_RATES; payload: boolean }
  | { type: typeof messageActions.SET_IS_INITIAL_LOAD; payload: boolean }
  | { type: typeof messageActions.CLEAR_MESSAGES };

const initialState: MessageState = {
  saveMessage: '',
  loadMessage: '',
  rateUpdateMessage: '',
  isLoading: false,
  isUpdatingRates: false,
  isInitialLoad: true
};

export function messageReducer(state: MessageState, action: MessageAction): MessageState {
  switch (action.type) {
    case messageActions.SET_SAVE_MESSAGE:
      return {
        ...state,
        saveMessage: action.payload
      };
    
    case messageActions.SET_LOAD_MESSAGE:
      return {
        ...state,
        loadMessage: action.payload
      };
    
    case messageActions.SET_RATE_UPDATE_MESSAGE:
      return {
        ...state,
        rateUpdateMessage: action.payload
      };
    
    case messageActions.SET_IS_LOADING:
      return {
        ...state,
        isLoading: action.payload
      };
    
    case messageActions.SET_IS_UPDATING_RATES:
      return {
        ...state,
        isUpdatingRates: action.payload
      };
    
    case messageActions.SET_IS_INITIAL_LOAD:
      return {
        ...state,
        isInitialLoad: action.payload
      };
    
    case messageActions.CLEAR_MESSAGES:
      return {
        ...state,
        saveMessage: '',
        loadMessage: '',
        rateUpdateMessage: ''
      };
    
    default:
      return state;
  }
}

export function createMessageInitialState(): MessageState {
  return { ...initialState };
}

