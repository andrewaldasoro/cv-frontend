import React, { useEffect, useState, Suspense } from "react";
import { BrowserRouter, Switch, Route } from "react-router-dom";
import "./Main.scss";

import Loader from "./Loader";
import Page404 from "./Page404";
import Header from "./Header";
import Navbar from "./Navbar";
import Content from "./Content";
import Map from "./Map";
import Footer from "./Footer";

import pjson from "../../package.json";

console.log(`Version: ${pjson.version}`);

function Body() {
  const [fixed, setFixed] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const isFixed = (_ev: Event) => {
      if (window.pageYOffset >= window.innerHeight) {
        setFixed(true);
      } else {
        setFixed(false);
      }
    };

    window.addEventListener("scroll", isFixed, true);

    return () => {
      window.removeEventListener("scroll", isFixed, true);
    };
  }, [fixed]);

  return (
    <BrowserRouter>
      <div className="App">
        <Header />
        <div className="body">
          <div
            style={{
              width: "100%",
              position: fixed ? "fixed" : "absolute",
              top: fixed ? 0 : window.innerHeight,
            }}
          >
            <Navbar />
          </div>
          <div className="content-container">
            <Switch>
              <Route exact path="/">
                <Content title="summary" />
                <Content title="skills" />
                <Content title="employment" />
                <Content title="education" />
              </Route>
              <Route path="/map">
                <Map />
              </Route>
              <Route path="*">
                <Page404 />
              </Route>
            </Switch>
          </div>
          <Footer />
        </div>
      </div>
    </BrowserRouter>
  );
}

// here app catches the suspense from page in case translations are not yet loaded
const Main: React.FC = (): JSX.Element => (
  <Suspense
    fallback={
      <div className="loading">
        <Loader />
      </div>
    }
  >
    <Body />
  </Suspense>
);

export default Main;
