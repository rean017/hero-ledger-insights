export const getFunctionsUrl = () => {
  // Auto-configure with project default if not set
  const defaultUrl = 'https://twyskqhuxzqzclzoejmd.supabase.co/functions/v1';
  
  return (typeof window !== 'undefined'
    ? window.localStorage.getItem('MH_FUNCTIONS_URL') || defaultUrl
    : process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL || defaultUrl
  ).replace(/\/+$/, ''); // no trailing slash
};

export const setFunctionsUrl = (url: string) => {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem('MH_FUNCTIONS_URL', url);
  }
};