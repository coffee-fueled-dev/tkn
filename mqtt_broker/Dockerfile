FROM eclipse-mosquitto:latest

COPY mosquitto/config /mosquitto/config
COPY mosquitto/data /mosquitto/data
COPY mosquitto/log /mosquitto/log

EXPOSE 1883 9001

CMD ["/usr/sbin/mosquitto", "-c", "/mosquitto/config/mosquitto.conf"]