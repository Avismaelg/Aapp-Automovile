FROM eclipse-temurin:25-jre

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /graphhopper

# Versión fijada para que el servidor sea reproducible.
RUN curl -fL \
      https://repo1.maven.org/maven2/com/graphhopper/graphhopper-web/11.1/graphhopper-web-11.1.jar \
      -o graphhopper.jar \
  && curl -fL \
      https://raw.githubusercontent.com/graphhopper/graphhopper/11.x/config-example.yml \
      -o config.yml

ENV JAVA_OPTS="-Xmx4g -Xms2g"

EXPOSE 8989

CMD ["sh", "-c", "java $JAVA_OPTS -D\"dw.graphhopper.datareader.file=/data/region.osm.pbf\" -Ddw.graphhopper.graph.location=/data/graph-cache -D\"dw.server.application_connectors[0].bind_host=0.0.0.0\" -jar graphhopper.jar server config.yml"]
