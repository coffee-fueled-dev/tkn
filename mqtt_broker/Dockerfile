FROM eclipse-mosquitto:latest

COPY mosquitto/config /mosquitto/config
COPY mosquitto/log /mosquitto/log
RUN mkdir -p /mosquitto/data

EXPOSE 1883 9001

CMD ["/usr/sbin/mosquitto", "-c", "/mosquitto/config/mosquitto.conf"]