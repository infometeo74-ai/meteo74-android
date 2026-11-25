package fr.meteo74.android;

final class UpdateConfig {
    static final String BASE_URL="https://bepcgggpdtxwaifiyrah.supabase.co/functions/v1/meteo74-updates";
    // Public anonymous key. The endpoint serves only APK bytes and release metadata.
    static final String ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJlcGNnZ2dwZHR4d2FpZml5cmFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU1OTg5NTksImV4cCI6MjExMTE3NDk1OX0.qRCXb7lLdpZT6seIgmQ7jTRCgaPirbHSorYvrxnebwk";
    static final int VERSION_CODE=8;
    static final String VERSION_NAME="0.4.0";
    private UpdateConfig(){}
}

