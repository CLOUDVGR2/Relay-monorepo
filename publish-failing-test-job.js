/** Publish failing test job module for the Relay repository tooling. */

const amqp = require("amqplib");
const { randomUUID } = require("node:crypto");

async function main() {
  const user = process.env.RABBITMQ_DEFAULT_USER;
  const pass = process.env.RABBITMQ_DEFAULT_PASS;
  const host = process.env.RABBITMQ_HOST || "localhost:5672";

  if (!user || !pass) {
    throw new Error("RabbitMQ credentials are missing from the environment");
  }

  const connection = await amqp.connect(
    `amqp://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}`
  );

  try {
    const channel = await connection.createConfirmChannel();

    try {
      await channel.assertQueue("go.jobs", { durable: true });

      const job = {
        id: randomUUID(),
        type: "unsupported-test-type",
        message: "Intentional failure to test retries and dead-lettering"
      };

      channel.sendToQueue(
        "go.jobs",
        Buffer.from(JSON.stringify(job)),
        { persistent: true }
      );

      await channel.waitForConfirms();
      console.log("RabbitMQ confirmed intentional failure-test job:", JSON.stringify(job));
    } finally {
      await channel.close();
    }
  } finally {
    await connection.close();
  }
}

main().catch((error) => {
  console.error("Failed to publish test job:", error.message);
  process.exitCode = 1;
});
