type ErrorWithCode = {
	code?: unknown;
};

export function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	if (typeof error === 'string') {
		return error;
	}

	return 'Unknown database error';
}

export function getErrorCode(error: unknown): string | undefined {
	if (typeof error !== 'object' || error === null) {
		return undefined;
	}

	const { code } = error as ErrorWithCode;
	return typeof code === 'string' ? code : undefined;
}
