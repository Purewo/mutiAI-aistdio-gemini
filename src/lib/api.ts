export const API_BASE = '/api/v1';

export async function login(username: string, password: string) {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    throw new Error('Login failed');
  }
  return response.json();
}

export async function logout() {
  const response = await fetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('Logout failed');
  }
  return response.json();
}

export async function getMe() {
  const response = await fetch(`${API_BASE}/auth/me`);
  if (!response.ok) {
    throw new Error('Failed to fetch user');
  }
  return response.json();
}

export async function listOrganizations() {
  const response = await fetch(`${API_BASE}/organizations`);
  if (!response.ok) {
    throw new Error('Failed to fetch organizations');
  }
  return response.json();
}

export async function getOrganization(orgId: string) {
  const response = await fetch(`${API_BASE}/organizations/${orgId}`);
  if (!response.ok) {
    throw new Error('Failed to fetch organization');
  }
  return response.json();
}
