import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { User } from "@db/schema";

type LoginData = {
  username: string;
  password: string;
};

type RequestResult = {
  message: string;
  user?: User;
};

async function fetchUser(): Promise<User | null> {
  const response = await fetch('/api/user', {
    credentials: 'include'
  });

  if (!response.ok) {
    if (response.status === 401) {
      return null;
    }
    throw new Error(`${response.status}: ${await response.text()}`);
  }

  return response.json();
}

export function useUser() {
  const queryClient = useQueryClient();

  const { data: user, error, isLoading } = useQuery<User | null, Error>({
    queryKey: ['user'],
    queryFn: fetchUser,
    staleTime: Infinity,
    retry: false
  });

  const loginMutation = useMutation({
    mutationFn: async (data: LoginData): Promise<RequestResult> => {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include'
      });

      const result = await response.text();

      if (!response.ok) {
        throw new Error(result);
      }

      try {
        return JSON.parse(result);
      } catch {
        throw new Error('Invalid server response');
      }
    },
    onSuccess: (data) => {
      if (data.user) {
        queryClient.setQueryData(['user'], data.user);
      }
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async (): Promise<RequestResult> => {
      const response = await fetch('/api/logout', {
        method: 'POST',
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      // Clear all queries from the cache
      queryClient.clear();
      // Set user data to null
      queryClient.setQueryData(['user'], null);
      return response.json();
    }
  });

  const registerMutation = useMutation({
    mutationFn: async (data: LoginData): Promise<RequestResult> => {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include'
      });

      const result = await response.text();

      if (!response.ok) {
        throw new Error(result);
      }

      try {
        return JSON.parse(result);
      } catch {
        throw new Error('Invalid server response');
      }
    },
    onSuccess: (data) => {
      if (data.user) {
        queryClient.setQueryData(['user'], data.user);
      }
    },
  });

  return {
    user,
    isLoading,
    error,
    login: loginMutation.mutateAsync,
    logout: logoutMutation.mutateAsync,
    register: registerMutation.mutateAsync,
  };
}