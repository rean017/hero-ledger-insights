export const getFunctionsUrl = () =>
  (typeof window !== 'undefined'
    ? window.localStorage.getItem('MH_FUNCTIONS_URL') || ''
    : process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL || ''
  ).replace(/\/+$/, ''); // no trailing slash

export const setFunctionsUrl = (url: string) => {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem('MH_FUNCTIONS_URL', url);
  }
};