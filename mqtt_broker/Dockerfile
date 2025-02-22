FROM eclipse-mosquitto:latest

# Copy configuration files only
COPY mosquitto/config /mosquitto/config

# Create necessary directories in the container
RUN mkdir -p /mosquitto/data /mosquitto/log \
    && touch /mosquitto/log/mosquitto.log

# Set correct permissions (recommended)
RUN chown -R mosquitto:mosquitto /mosquitto

# Expose MQTT (1883) and WebSockets (9001)
EXPOSE 1883 9001

# Start Mosquitto
CMD ["/usr/sbin/mosquitto", "-c", "/mosquitto/config/mosquitto.conf"]