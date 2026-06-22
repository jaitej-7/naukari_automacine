FROM mcr.microsoft.com/playwright:v1.49.1-noble

# Set the working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Run prisma generate to build the database client
RUN npx prisma generate

# Expose any necessary ports (if your daemon runs a server, though it looks like it polls)
EXPOSE 3000

# Start the daemon
CMD ["node", "src/daemon.js"]
