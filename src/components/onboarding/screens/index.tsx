'use client';

import type { ComponentType } from 'react';
import {
  ChatComposerScreen, ChatListMenuScreen, ChatMessageScreen, ChatNewScreen, ChatOverviewScreen, ChatRoomSettingsScreen,
} from './chatScreens';
import {
  BrokerDayScreen, CalendarMonthScreen, CalendarWeekScreen, PlanningPromptScreen,
  TasksBoardScreen, TasksEditorScreen, TasksGameScreen, TasksOverviewScreen,
} from './taskScreens';
import {
  AppShellScreen, CallFlowScreen, DirectoryCardsScreen, DirectoryProfileScreen, LoadLifecycleScreen,
  MoneyFlowScreen, PartiesScreen, QuoteCalculatorScreen,
} from './otherScreens';

/**
 * Every drawn screen, by the id a guide section names in `screen`. A section
 * naming an id that is not here draws nothing — so after a redesign removes
 * a screen, search the guides for its id.
 *
 * To use a real screenshot instead of a drawing, put the image in
 * public/onboarding/ and name it in `SCREENSHOTS` below; it is shown in place
 * of the drawing (without the numbered markers — a picture has no parts to
 * point at). Only ever a screenshot of made-up data: these pages are read by
 * every new hire.
 */
export const SCREENS: Record<string, ComponentType> = {
  'app-shell': AppShellScreen,
  'chat-overview': ChatOverviewScreen,
  'chat-new': ChatNewScreen,
  'chat-composer': ChatComposerScreen,
  'chat-message': ChatMessageScreen,
  'chat-list-menu': ChatListMenuScreen,
  'chat-room-settings': ChatRoomSettingsScreen,
  'tasks-overview': TasksOverviewScreen,
  'tasks-editor': TasksEditorScreen,
  'tasks-board': TasksBoardScreen,
  'tasks-game': TasksGameScreen,
  'calendar-month': CalendarMonthScreen,
  'calendar-week': CalendarWeekScreen,
  'planning-prompt': PlanningPromptScreen,
  'broker-day': BrokerDayScreen,
  'directory-cards': DirectoryCardsScreen,
  'directory-profile': DirectoryProfileScreen,
  'money-flow': MoneyFlowScreen,
  'quote-calculator': QuoteCalculatorScreen,
  'parties': PartiesScreen,
  'load-lifecycle': LoadLifecycleScreen,
  'call-flow': CallFlowScreen,
};

/** Screen id → image path under public/, for any screen replaced by a real screenshot. */
export const SCREENSHOTS: Record<string, string> = {};
