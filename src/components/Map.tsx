import React, { useEffect, useState, useRef } from "react";
import PropTypes from "prop-types";
import mapboxgl, { GeoJSONSource, LngLatLike } from "mapbox-gl";
import {
  FeatureCollection,
  Geometry,
  GeoJsonProperties,
  Polygon,
} from "geojson";
import "./Map.scss";
import { getUrl } from "../services/api";
import { Button, Spinner } from "react-bootstrap";
import polylabel from "polylabel";
import {
  CovidRecord,
  DataStore,
  NeighbourhoodRecord,
  PackageShow,
} from "../interfaces/toronto";
import Emoji from "./Emoji";
import Loader from "./Loader";

interface MapboxToken {
  token: string;
}

interface InitializeMapTypes {
  setMap: React.Dispatch<React.SetStateAction<mapboxgl.Map | undefined>>;
  mapEl: React.RefObject<HTMLDivElement>;
}

const NEIGHBOURHOODS_ID = "4def3f65-2a65-4a4f-83c4-b2a4aed72d46";
const COVID_ID = "64b54586-6180-4485-83eb-81e8fae3b8fe";

const INITIAL_COORDINATES = { lng: -79.404, lat: 43.698 };
const INITIAL_ZOOM = 10;

const Map: React.FC<{ changeSize?: boolean }> = (props) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(getUrl("/mapbox-token/create"))
      .then((result) => result.json() as Promise<MapboxToken>)
      .then(({ token }) => {
        mapboxgl.accessToken = token;
        setIsLoaded(true);
      })
      .catch((error) => {
        console.error(error);
        setError(error.message);
        setIsLoaded(true);
      });
  }, []);

  return isLoaded ? (
    !error ? (
      <MapInit {...props} />
    ) : (
      <div>{error}</div>
    )
  ) : (
    <div>
      <Loader />
    </div>
  );
};

Map.propTypes = {
  changeSize: PropTypes.bool,
};

const MapInit: React.FC<{ changeSize?: boolean }> = (props) => {
  const [map, setMap] = useState<mapboxgl.Map>();
  const [coordinates, setCoordinates] = useState(INITIAL_COORDINATES);
  const [zoom, setZoom] = useState(INITIAL_ZOOM);
  const [reportedDate, setReportedDate] = useState("");
  const [isDataLoaded, setIsDataLoaded] = useState(false);

  const mapEl = useRef<HTMLDivElement>(null);

  const mapInitialValues = {
    pitch: 40,
    bearing: 20,
    antialias: true,
  };

  const torontoNeighbourhoods: FeatureCollection<
    Geometry,
    GeoJsonProperties
  > = {
    type: "FeatureCollection",
    features: [],
  };

  useEffect(() => {
    if (map) map.resize();
  }, [props.changeSize]);

  // const changeSizeSuscription = changeSizeStore.subscribe(() => {
  //   if (map) map.resize();
  // });

  useEffect(() => {
    const initializeMap = ({ setMap, mapEl }: InitializeMapTypes) => {
      const map = new mapboxgl.Map({
        container: mapEl.current as HTMLElement,
        style: "mapbox://styles/mapbox/dark-v10",
        center: [coordinates.lng, coordinates.lat],
        zoom,
        ...mapInitialValues,
      });

      map.addControl(
        new mapboxgl.NavigationControl({ visualizePitch: true }),
        "bottom-right"
      );

      map.on("move", () => {
        setCoordinates({
          lng: parseFloat(map.getCenter().lng.toFixed(3)),
          lat: parseFloat(map.getCenter().lat.toFixed(3)),
        });
        setZoom(parseFloat(map.getZoom().toFixed(2)));
      });

      map.on("load", async () => {
        setMap(map);

        map.resize();
        map.addSource("toronto-neighbourhoods", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [],
          },
        });

        map.addLayer({
          id: "toronto-neighbourhoods",
          type: "fill-extrusion",
          source: "toronto-neighbourhoods",
          paint: {
            "fill-extrusion-color": [
              "interpolate",
              ["linear"],
              [
                "/",
                ["get", "covidActiveCases"],
                ["/", ["get", "shapeArea"], 1000000],
              ],
              0,
              "black",
              1,
              "yellow",
              20,
              "orange",
              50,
              "red",
            ],
            "fill-extrusion-height": ["get", "covidActiveCases"],
            "fill-extrusion-base": 0,
            "fill-extrusion-opacity": 0.5,
          },
          filter: ["==", "$type", "Polygon"],
        });

        map.addLayer({
          id: "neighbourhood-labels",
          type: "symbol",
          source: "toronto-neighbourhoods",
          layout: {
            "text-field": ["get", "name"],
            "text-variable-anchor": ["top", "bottom", "left", "right"],
            "text-radial-offset": 0.5,
            "text-justify": "center",
            "text-size": ["interpolate", ["linear"], ["zoom"], 11, 10, 15, 20],
          },
          paint: {
            "text-color": "#ffffff",
            "text-halo-width": 1,
            "text-halo-color": "#222222",
            "text-halo-blur": 1,
          },
        });

        const { id: nId, total: nTotal } = await fetchTorontoPackageShow(`{
            result(id: "${NEIGHBOURHOODS_ID}") {
              title
              resources {
                datastoreActive
                id
                format
                total
              }
            }
          }`).then((response) => {
          const { resources } = response;
          const resource = resources.find((r) => r.datastoreActive);
          if (resource) {
            setReportedDate(resource.lastModified);
            return { id: resource.id, total: resource.total };
          } else {
            return { id: undefined, total: undefined };
          }
        });

        if (nId && nTotal) {
          const totalPages = nTotal / 100;
          for (let page = 0; page < totalPages; page++) {
            for (const record of (
              await fetchTorontoDataStore(`{
              result(id: "${nId}", page: ${page}) {
                neighbourhoodsRecords {
                  geometry
                  areaId
                  areaName
                  shapeArea
                }
              }
            }`)
            ).neighbourhoodsRecords as NeighbourhoodRecord[]) {
              torontoNeighbourhoods["features"].push({
                type: "Feature",
                geometry: JSON.parse(record.geometry) as Geometry,
                properties: {
                  id: record.areaId,
                  name: record.areaName.split(/ \((\d+)\)/)[0],
                  shapeArea: record.shapeArea,
                  covidActiveCases: 0,
                  covid: [],
                },
              });
            }
          }
          (map.getSource("toronto-neighbourhoods") as GeoJSONSource).setData(
            torontoNeighbourhoods
          );
        }

        const { id: cId, total: cTotal } = await fetchTorontoPackageShow(`{
            result(id: "${COVID_ID}") {
              title
              resources {
                datastoreActive
                id
                format
                lastModified
                total
              }
            }
          }`).then(({ resources }) => {
          const resource = resources.find((r) => r.datastoreActive);
          if (resource) {
            setReportedDate(resource.lastModified);
            return { id: resource.id, total: resource.total };
          } else {
            return { id: undefined, total: undefined };
          }
        });
        if (cId && cTotal) {
          const totalPages = cTotal / 100;
          for (let page = 0; page < totalPages; page++) {
            for (const record of (
              await fetchTorontoDataStore(`{
              result(id: "${cId}", page:${page}) {
                covidRecords {
                  neighbourhoodName
                  outcome
                  currentlyHospitalized
                }
              }
            }`)
            ).covidRecords as CovidRecord[]) {
              torontoNeighbourhoods.features
                .find((el) => el.properties?.name === record.neighbourhoodName)
                ?.properties?.covid.push(record);

              incrementKeyNumber(
                torontoNeighbourhoods.features.find(
                  (el) => el.properties?.name === record.neighbourhoodName
                )?.properties,
                "covidActiveCases"
              );
            }
            if (page % 5 === 0) {
              (map.getSource(
                "toronto-neighbourhoods"
              ) as GeoJSONSource).setData(torontoNeighbourhoods);
            }
          }
          (map.getSource("toronto-neighbourhoods") as GeoJSONSource).setData(
            torontoNeighbourhoods
          );

          setIsDataLoaded(true);
        }
      });

      map.on("click", "toronto-neighbourhoods", (ev) => {
        const coordinates = ev.features
          ? (polylabel((ev.features[0].geometry as Polygon).coordinates).slice(
              0,
              2
            ) as LngLatLike)
          : (ev.lngLat.toArray() as LngLatLike);

        const descriptionElements: Array<CovidRecord> = JSON.parse(
          ev.features ? ev.features[0].properties?.covid : "[]"
        );

        const description = `<h5>${
          ev.features ? ev.features[0].properties?.name : "No Name"
        }</h5>
        <p>Total Cases: ${descriptionElements.length}</p>
        <p>Active Cases: ${
          descriptionElements.filter((e) => e.outcome === "ACTIVE").length
        }</p>
        <p>Hospitalized: ${
          descriptionElements.filter((e) => e.currentlyHospitalized === "Yes")
            .length
        }</p>`;

        new mapboxgl.Popup()
          .setLngLat(coordinates)
          .setHTML(description)
          .addTo(map);
      });

      map.on("error", (ev) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((ev.error as any).status === 401) {
          fetch(getUrl("/mapbox-token/create"))
            .then((result) => result.json() as Promise<MapboxToken>)
            .then(({ token }) => {
              mapboxgl.accessToken = token;
            })
            .catch((error) => {
              console.error(error);
            });
        }
      });
    };

    if (!map) initializeMap({ setMap, mapEl });

    return () => {
      if (map) map.remove();
    };
  }, [map]);

  const centerMap = () => {
    if (map) map.flyTo({ center: INITIAL_COORDINATES, zoom: INITIAL_ZOOM });
  };

  return (
    <div className="map-container">
      <div className="center-sidebar">
        {/* <div>
          Longitude: {coordinates.lng} | Latitude: {coordinates.lat} | Zoom:{" "}
          {zoom}
        </div> */}
        <div>Last Modified: {reportedDate}</div>
      </div>
      <div className="right-sidebar">
        {isDataLoaded ? null : (
          <Button variant="primary" disabled>
            <Spinner
              as="span"
              animation="border"
              size="sm"
              role="status"
              aria-hidden="true"
            />
            <span className="sr-only">Loading...</span>
          </Button>
        )}
        <Button
          onClick={() => {
            centerMap();
          }}
        >
          {new Emoji("🏡", "Center").render()}
        </Button>
      </div>
      <div ref={mapEl} className="map" />
    </div>
  );
};

MapInit.propTypes = {
  changeSize: PropTypes.bool,
};

/**
 *
 * @param path Fetch path
 * @type string
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fetchOr = (path: string, query: string) =>
  fetch(getUrl(path), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query }),
  })
    .then((result) => result.json())
    .then((result) => result.data.result)
    .catch((err) => {
      console.error(err);
    });

/**
 *
 * @param query GraphQL query
 * @type string
 */
const fetchTorontoPackageShow = (query: string): Promise<PackageShow> =>
  fetchOr("/toronto/package-show", query);

/**
 *
 * @param query GraphQL query
 * @type string
 */
const fetchTorontoDataStore = (query: string): Promise<DataStore> =>
  fetchOr("/toronto/datastore", query);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function incrementKeyNumber(obj: any, key: string): void {
  if (obj) {
    if (obj["outcome"] !== "ACTIVE") {
      obj[key]++;
    }
  }
}

export default Map;
