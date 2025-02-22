FROM eclipse-mosquitto:latest

# Copy configuration files
COPY mosquitto/config /mosquitto/config

# Ensure data & log directories exist
RUN mkdir -p /mosquitto/data /mosquitto/log && \
    touch /mosquitto/config/passwords.txt && \
    chown -R root:root /mosquitto/config/passwords.txt && \
    chmod 0600 /mosquitto/config/passwords.txt

# Expose MQTT ports
EXPOSE 1883 9001

# Run Mosquitto
CMD ["/usr/sbin/mosquitto", "-c", "/mosquitto/config/mosquitto.conf"]