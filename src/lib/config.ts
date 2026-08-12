import axios from 'axios';

// Central API base URL config for the app
// Use Vite env `VITE_API_BASE_URL` if provided, otherwise fallback to localhost.

// Use VITE_API_BASE_URL if set, otherwise fallback to /api for production, or localhost for dev.
// let baseUrl: string = (import.meta as any).env?.VITE_API_BASE_URL ?? 'https://farm-connect.amritagrotech.com/api';
let baseUrl: string = (import.meta as any).env?.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';
// let baseUrl: string = (import.meta as any).env?.VITE_API_BASE_URL ?? 'http://192.168.1.7:8000';

// let baseUrl: string = (import.meta as any).env?.VITE_API_BASE_URL ?? 'https://api.saibioresources.com/api';


export const getBaseUrl = (): string => baseUrl;

export const setBaseUrl = (url: string) => {
  baseUrl = url;
};

export default getBaseUrl;

// =========================
// MODULE GROUPS CONFIG
// =========================
export const MODULE_GROUPS = [
  {
    key: 'operation',
    label: 'Operation',
    modules: [
      {
        key: 'cultivation-master',
        label: 'Operations Master',
        path: '/cultivation-master',
        component: 'CultivationMasterModule', // Should be imported dynamically in router
        description: 'Manage cultivation setup, dosage controls, and land hierarchy references.'
      },
      {
        key: 'cultivation-plan',
        label: 'Cultivation Plan',
        path: '/cultivation-plan',
        component: 'CultivationPlanModule',
        description: 'View and manage cultivation plans.'
      }
    ]
  }
];

const BASE_URL = import.meta.env.VITE_BACKEND_URL;

export const getMasterCultivationPlans = () => {
  return axios.get(`${BASE_URL}admin_cultivation/get_master_cultivation_plans`);
};
