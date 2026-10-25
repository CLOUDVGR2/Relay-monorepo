import { API_ORIGIN, api } from './api';

type GraphQLError = { message: string };

type GraphQLResponse<T> = {
  data?: T;
  errors?: GraphQLError[];
};

export async function graphql<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  let responseData: GraphQLResponse<T>;

  try {
    const response = await api.post<GraphQLResponse<T>>(
      `${API_ORIGIN}/graphql`,
      { query, variables },
      { timeout: 45000 },
    );
    responseData = response.data;
  } catch (err: unknown) {
    const axiosError = err as {
      response?: { data?: GraphQLResponse<T> | string };
      message?: string;
    };

    const body = axiosError.response?.data;
    const errors =
      body && typeof body === 'object' && Array.isArray(body.errors)
        ? body.errors
        : [];

    if (errors.length) {
      throw new Error(errors.map((item) => item.message).join(' '));
    }

    if (typeof body === 'string' && body.trim()) {
      throw new Error(body);
    }

    throw new Error(
      `GraphQL request failed${axiosError.message ? `: ${axiosError.message}` : '.'}`,
    );
  }

  if (responseData.errors?.length) {
    throw new Error(
      responseData.errors.map((item) => item.message).join(' '),
    );
  }

  if (!responseData.data) {
    throw new Error('The server returned an unexpected GraphQL response.');
  }

  return responseData.data;
}
