import type { ExecutorMode, PortalType, WidgetKind } from '../src/shared/types.ts';

type PortalCapabilities = {
  supportedWidgets: WidgetKind[];
  reviewOnlyWidgets: WidgetKind[];
};

const NATIVE_WIDGETS: WidgetKind[] = [
  'text',
  'textarea',
  'select',
  'radio_group',
  'checkbox',
  'file_upload',
  'number',
  'date',
];

const REVIEW_ONLY_WIDGETS: WidgetKind[] = [
  'custom_combobox',
  'custom_multiselect',
  'custom_card_group',
  'custom_date',
  'custom_number',
  'unknown',
];

const LOCAL_AGENT_SUPPORTED_WIDGETS: WidgetKind[] = [
  ...NATIVE_WIDGETS,
  'custom_combobox',
  'custom_multiselect',
  'custom_card_group',
  'custom_date',
  'custom_number',
];

const PORTAL_CAPABILITIES: Record<PortalType, PortalCapabilities> = {
  linkedin: {
    supportedWidgets: NATIVE_WIDGETS,
    reviewOnlyWidgets: REVIEW_ONLY_WIDGETS,
  },
  naukri: {
    supportedWidgets: NATIVE_WIDGETS,
    reviewOnlyWidgets: REVIEW_ONLY_WIDGETS,
  },
  phenom: {
    supportedWidgets: NATIVE_WIDGETS,
    reviewOnlyWidgets: REVIEW_ONLY_WIDGETS,
  },
  greenhouse: {
    supportedWidgets: NATIVE_WIDGETS,
    reviewOnlyWidgets: REVIEW_ONLY_WIDGETS,
  },
  lever: {
    supportedWidgets: NATIVE_WIDGETS,
    reviewOnlyWidgets: REVIEW_ONLY_WIDGETS,
  },
  ashby: {
    supportedWidgets: NATIVE_WIDGETS,
    reviewOnlyWidgets: REVIEW_ONLY_WIDGETS,
  },
  workday: {
    supportedWidgets: NATIVE_WIDGETS,
    reviewOnlyWidgets: REVIEW_ONLY_WIDGETS,
  },
  icims: {
    supportedWidgets: NATIVE_WIDGETS,
    reviewOnlyWidgets: REVIEW_ONLY_WIDGETS,
  },
  smartrecruiters: {
    supportedWidgets: NATIVE_WIDGETS,
    reviewOnlyWidgets: REVIEW_ONLY_WIDGETS,
  },
  taleo: {
    supportedWidgets: NATIVE_WIDGETS,
    reviewOnlyWidgets: REVIEW_ONLY_WIDGETS,
  },
  successfactors: {
    supportedWidgets: NATIVE_WIDGETS,
    reviewOnlyWidgets: REVIEW_ONLY_WIDGETS,
  },
  generic: {
    supportedWidgets: NATIVE_WIDGETS,
    reviewOnlyWidgets: REVIEW_ONLY_WIDGETS,
  },
  protected: {
    supportedWidgets: [],
    reviewOnlyWidgets: REVIEW_ONLY_WIDGETS,
  },
  unknown: {
    supportedWidgets: NATIVE_WIDGETS,
    reviewOnlyWidgets: REVIEW_ONLY_WIDGETS,
  },
};

export function detectPortalTypeFromUrl(applyUrl: string): PortalType {
  try {
    const url = new URL(applyUrl);
    const host = url.hostname.toLowerCase();
    if (host.includes('linkedin.com')) return 'linkedin';
    if (host.includes('naukri.com')) return 'naukri';
    if (host.includes('greenhouse')) return 'greenhouse';
    if (host.includes('lever.co')) return 'lever';
    if (host.includes('ashbyhq.com')) return 'ashby';
    if (host.includes('myworkdayjobs.com') || host.includes('workdayjobs.com')) return 'workday';
    if (host.includes('icims.com')) return 'icims';
    if (host.includes('smartrecruiters.com')) return 'smartrecruiters';
    if (host.includes('taleo.net')) return 'taleo';
    if (host.includes('successfactors')) return 'successfactors';
    if (host.includes('phenompeople.com')) return 'phenom';
    return 'generic';
  } catch {
    return 'unknown';
  }
}

export function getPortalCapabilities(portalType: PortalType): PortalCapabilities {
  return PORTAL_CAPABILITIES[portalType] ?? PORTAL_CAPABILITIES.generic;
}

export function isWidgetSupported(portalType: PortalType, widgetKind: WidgetKind, executorMode: ExecutorMode = 'extension'): boolean {
  if (executorMode === 'local_agent' && portalType !== 'protected') {
    return LOCAL_AGENT_SUPPORTED_WIDGETS.includes(widgetKind);
  }
  return getPortalCapabilities(portalType).supportedWidgets.includes(widgetKind);
}
