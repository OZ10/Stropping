package com.oz10.stropping;

import android.support.v4.app.FragmentManager;
import android.support.v4.app.FragmentTransaction;
import android.support.v7.app.AppCompatActivity;
import android.os.Bundle;

public class IngredientsAddActivity extends AppCompatActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_ingredients_add);

        FragmentManager fragmentManager = getSupportFragmentManager();
        FragmentTransaction fragmentTransaction = fragmentManager.beginTransaction();

        IngredientsListFragment ingredientsListFragment = new IngredientsListFragment();
        fragmentTransaction.add(R.id.ingredients_add_listview, ingredientsListFragment);
        fragmentTransaction.commit();
    }
}
