/**
 * gRPC Server
 * High-performance gRPC server for policy operations
 */
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { config } from '@utils/config';
import logger from '@utils/logger';
import { db } from '@db/client';
import { PolicyServiceImpl } from './services/policy-service';

const PROTO_PATH = path.join(__dirname, '../../proto/policy.proto');

export function createGRPCServer(): grpc.Server {
  const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });

  const policyProto = grpc.loadPackageDefinition(packageDefinition) as any;

  const server = new grpc.Server({
    'grpc.max_receive_message_length': 10 * 1024 * 1024,
    'grpc.max_send_message_length': 10 * 1024 * 1024,
  });

  const policyService = new PolicyServiceImpl();

  server.addService(policyProto.llmpolicy.PolicyService.service, {
    createPolicy: policyService.createPolicy.bind(policyService),
    getPolicy: policyService.getPolicy.bind(policyService),
    updatePolicy: policyService.updatePolicy.bind(policyService),
    deletePolicy: policyService.deletePolicy.bind(policyService),
    listPolicies: policyService.listPolicies.bind(policyService),
    evaluatePolicy: policyService.evaluatePolicy.bind(policyService),
    evaluatePolicyStream: policyService.evaluatePolicyStream.bind(policyService),
  });

  return server;
}

export async function startGRPCServer(port?: number): Promise<void> {
  const server = createGRPCServer();
  const grpcPort = port || config.server.grpcPort;
  const bindAddress = `${config.server.host}:${grpcPort}`;

  try {
    const dbHealthy = await db.ping();
    if (!dbHealthy) {
      logger.error('Database connection failed. Exiting...');
      process.exit(1);
    }

    server.bindAsync(
      bindAddress,
      grpc.ServerCredentials.createInsecure(),
      (error, port) => {
        if (error) {
          logger.error({ error }, 'Failed to bind gRPC server');
          process.exit(1);
        }

        server.start();

        logger.info(
          {
            port,
            host: config.server.host,
            env: config.nodeEnv,
          },
          'gRPC server started',
        );
      },
    );

    const gracefulShutdown = async (signal: string) => {
      logger.info({ signal }, 'Received shutdown signal');

      server.tryShutdown(async (error) => {
        if (error) {
          logger.error({ error }, 'Error during gRPC server shutdown');
          server.forceShutdown();
        } else {
          logger.info('gRPC server closed');
        }

        try {
          await db.close();
          logger.info('Connections closed successfully');
          process.exit(0);
        } catch (err) {
          logger.error({ error: err }, 'Error during shutdown');
          process.exit(1);
        }
      });

      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        server.forceShutdown();
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  } catch (error) {
    logger.error({ error }, 'Failed to start gRPC server');
    process.exit(1);
  }
}

if (require.main === module) {
  startGRPCServer();
}
