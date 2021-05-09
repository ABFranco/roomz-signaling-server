package main

import (
  "log"

  "github.com/roomz-signaling-server/server"

  "github.com/gin-gonic/gin"
)

// NOTE: This is for authentication with the RFE, we must add the correct
// origin/credential/methods, headers on each request.
func GinMiddleware(allowOrigin string) gin.HandlerFunc {
  return func(c *gin.Context) {
    c.Writer.Header().Set("Access-Control-Allow-Origin", allowOrigin)
    c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
    c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE")
    c.Writer.Header().Set("Access-Control-Allow-Headers", "Accept, Authorization, Content-Type, Content-Length, X-CSRF-Token, Token, session, Origin, Host, Connection, Accept-Encoding, Accept-Language, X-Requested-With")

    if c.Request.Method == "OPTIONS" {
      c.AbortWithStatus(204)
      return
    }

    c.Request.Header.Del("Origin")

    c.Next()
  }
}

func main() {
  router := gin.New()
  rms := server.New()

  go rms.Server.Serve()
  defer rms.Server.Close()

  router.Use(GinMiddleware("http://localhost:3000"))
  router.GET("/socket.io/*any", gin.WrapH(rms.Server))
  router.POST("/socket.io/*any", gin.WrapH(rms.Server))

  log.Fatal(router.Run(":5000"))
}