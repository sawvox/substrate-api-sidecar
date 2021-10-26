import { ApiPromise } from '@polkadot/api';
import { Request, Response } from 'express';
import { NextFunction } from 'express';

import { reconnectMiddleware } from './reconnectMiddleware';

interface IMockError {
	message: string;
}

const delay = (ms: number) => {
	return new Promise((resolve) => setTimeout(resolve, ms));
};

const mockApi = {
	isConnected: true,
	isReady: true,
	connect: () => Promise.resolve(),
	disconnect: () => Promise.resolve(),
} as unknown as ApiPromise;

describe('reconnectMiddleware', () => {
	const apiConnectionCache = {
		isReconnecting: false,
	};

	jest.setTimeout(10000);

	let res: Response, req: Request, next: NextFunction;
	beforeEach(() => {
		res = jest.fn() as unknown as Response;
		req = jest.fn() as unknown as Request;
		next = jest.fn() as unknown as NextFunction;
		apiConnectionCache.isReconnecting = false;

		(mockApi.isConnected as unknown) = true;
		(mockApi.isReady as unknown) = true;
	});

	it('Should successfully call next when connected', () => {
		reconnectMiddleware(mockApi, apiConnectionCache)(req, res, next);

		expect(next).toBeCalled();
	});

	it('Should succesfully reconnect when disconnected and call next', async () => {
		(mockApi.isConnected as unknown) = false;

		reconnectMiddleware(mockApi, apiConnectionCache)(req, res, next);
		await delay(2000);
		(mockApi.isConnected as unknown) = true;
		await delay(2000);

		expect(next).toBeCalled();
		expect(apiConnectionCache.isReconnecting).toBe(false);
	});

	it('Should correctly throw an error when max connection attempts is reached', async () => {
		(mockApi.isConnected as unknown) = false;

		try {
			// eslint-disable-next-line @typescript-eslint/await-thenable
			await reconnectMiddleware(mockApi, apiConnectionCache, 1)(req, res, next);
		} catch (e) {
			expect((e as IMockError).message).toBe(
				'Failed reconnecting to the API-WS, please check your node or manually restart sidecar.'
			);
		}
	});

	it('Should correctly throw an error when done reconnecting unsuccessfully', async () => {
		(apiConnectionCache.isReconnecting as unknown) = true;
		(mockApi.isConnected as unknown) = false;

		setTimeout(() => {
			(apiConnectionCache.isReconnecting as unknown) = false;
		}, 3000);

		try {
			// eslint-disable-next-line @typescript-eslint/await-thenable
			await reconnectMiddleware(mockApi, apiConnectionCache, 1)(req, res, next);
		} catch (e) {
			expect((e as IMockError).message).toBe(
				'Failed reconnecting to the API-WS, please check your node or manually restart sidecar.'
			);
		}
	});

	it('Should handle multiple requests correctly', async () => {
		// Acts as the first initial request the will attempt to reconnect recursively
		reconnectMiddleware(mockApi, apiConnectionCache)(req, res, next);
		// Delay to allow for a minimum a sinlge iteration of reconnection
		await delay(2000);
		// Send two more requests
		reconnectMiddleware(mockApi, apiConnectionCache)(req, res, next);
		reconnectMiddleware(mockApi, apiConnectionCache)(req, res, next);
		await delay(2000);
		(mockApi.isConnected as unknown) = true;
		await delay(2000);

		expect(next).toBeCalledTimes(3);
	});
});